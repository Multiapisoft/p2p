import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Withdrawal, WithdrawalDocument } from './schemas/withdrawal.schema';
import {
  WithdrawalPayment,
  WithdrawalPaymentDocument,
} from './schemas/withdrawal-payment.schema';
import {
  SubmitWithdrawalPaymentDto,
  RejectWithdrawalPaymentDto,
  DisputeWithdrawalPaymentDto,
} from './dto/withdrawal-payment.dto';
import { WalletService } from '../wallet/wallet.service';
import { PlatformCommissionService } from '../wallet/platform-commission.service';
import { CommissionService } from '../commission/commission.service';
import { TransactionService } from '../transaction/transaction.service';
import { BusinessService } from '../business/business.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { WebhookService } from '../webhook/webhook.service';
import { AuditService } from '../audit/audit.service';
import { SupportService } from '../support/support.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../common/enums/role.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { LedgerType, Currency, LedgerDirection, LedgerFlow } from '../../common/enums/currency.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { SupportPriority } from '../../common/enums/support-status.enum';
import { ExchangeRateService } from '../wallet/exchange-rate.service';
import { PartnerApiService } from '../integration/partner-api.service';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import {
  normalizeTxHash,
  normalizeUtr,
  paymentRefErrorForMethod,
} from '../../common/validators/contact.validators';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { investorCommissionInDescription } from '../wallet/utils/platform-commission-ledger.util';
import {
  toPayerCreditPublic,
  toPayerPaymentPublic,
} from './utils/payer-credit-public.util';
import { RedisService } from '../../redis/redis.service';
import { paymentReceivedNotification } from './utils/payment-notification.util';
import { assertUniquePaymentRef } from './utils/payment-ref-uniqueness.util';
import { isInvestorToInvestorPay, isOpenOnPayList } from './utils/withdrawal-visibility.util';
import {
  assignedToMeFilter,
  assignedToViewerFilter,
  isAssignedToOther,
  isAssignedToPayer,
  remainingOpenExpr,
} from './utils/withdrawal-assign.util';
import {
  MIN_PARTIAL_INR,
  MIN_PARTIAL_USDT,
  partialPayError,
} from './utils/partial-pay.util';
import { visibleInvestorBonusAmount } from '../commission/utils/investor-commission-visibility.util';
import { P2pRealtimeService } from '../realtime/p2p-realtime.service';
import {
  referralPercentsForPay,
  referralRewardAmount,
} from './utils/investor-referral-reward.util';

const VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLAIM_REDIS_PREFIX = 'withdrawal-claim:';

export type WithdrawalPaymentListOpts = ListQueryOpts & {
  method?: string;
  amount?: number;
  payType?: 'all' | 'partial' | 'full';
};

@Injectable()
export class WithdrawalPaymentService {
  constructor(
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(WithdrawalPayment.name)
    private paymentModel: Model<WithdrawalPaymentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private walletService: WalletService,
    private commissionService: CommissionService,
    private transactionService: TransactionService,
    private businessService: BusinessService,
    private storageService: StorageService,
    private notificationService: NotificationService,
    private webhookService: WebhookService,
    private auditService: AuditService,
    private exchangeRateService: ExchangeRateService,
    private supportService: SupportService,
    private partnerApiService: PartnerApiService,
    private platformSettingsService: PlatformSettingsService,
    private platformCommissionService: PlatformCommissionService,
    private redis: RedisService,
    private usersService: UsersService,
    private p2pRealtime: P2pRealtimeService,
  ) {}

  getRemaining(withdrawal: WithdrawalDocument) {
    const locked =
      (withdrawal.paidAmount || 0) + (withdrawal.reservedAmount || 0);
    return Math.max(0, withdrawal.amount - locked);
  }

  private assignedOpenQuery(userId: string) {
    const userOid = new Types.ObjectId(userId);
    return {
      $and: [
        assignedToMeFilter(userId),
        {
          userId: { $ne: userOid },
          status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
          p2pListStatus: 'listed' as const,
          $expr: remainingOpenExpr(),
        },
      ],
    };
  }

  private async loadAssignedOpen(userId: string) {
    return this.withdrawalModel
      .find(this.assignedOpenQuery(userId))
      .sort({ assignedAt: -1, createdAt: -1 })
      .limit(50)
      .exec();
  }

  /** Credit partner gaming wallet when a normal user deposits via P2P pay. */
  private async creditPayerPartnerDeposit(
    payer: UserDocument,
    amount: number,
    reason: string,
  ) {
    const businessId = payer.referredByBusiness?.toString();
    if (!businessId || amount <= 0) return;

    const business = await this.businessService.findDocumentById(businessId);
    if (!this.partnerApiService.isConfigured(business)) return;

    await this.partnerApiService.creditPartner(
      business,
      payer.email,
      amount,
      reason,
      partnerUserIdFromExternalRef(payer.externalRef),
    );
  }

  getLockedAmount(withdrawal: WithdrawalDocument) {
    return (withdrawal.paidAmount || 0) + (withdrawal.reservedAmount || 0);
  }

  /**
   * What the payer (investor) will receive after verify for a given pay amount.
   * Prefers withdrawal.businessId (business flow) for take/bonus rules.
   */
  async previewCredit(payerUserId: string, amount: number, withdrawalId?: string) {
    const payer = await this.userModel.findById(payerUserId).exec();
    if (!payer) throw new NotFoundException('User not found');

    let method: PaymentMethod | undefined;
    let payCurrency = Currency.INR;
    const payerBusinessId = await this.businessService.findBusinessIdForUser(payer);
    let wdBusinessId = payerBusinessId;
    let withdrawalRemaining: number | null = null;
    let isBusinessOrigin = false;
    if (withdrawalId) {
      const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      method = withdrawal.method;
      payCurrency = (withdrawal.currency as Currency) || Currency.INR;
      if (withdrawal.businessId) {
        wdBusinessId = withdrawal.businessId.toString();
      }
      isBusinessOrigin = withdrawal.origin === 'business';
      withdrawalRemaining = this.getRemaining(withdrawal);
      if (amount > withdrawalRemaining) {
        throw new BadRequestException(
          `Amount exceeds remaining ${withdrawalRemaining}`,
        );
      }
    }

    const isInvestor = payer.role === UserRole.INVESTOR;
    const { maxPayable: businessMax, p2pPayRemainingInr } = isBusinessOrigin
      ? { maxPayable: withdrawalRemaining ?? amount, p2pPayRemainingInr: null }
      : await this.businessService.getMaxPayableAmount(
          wdBusinessId,
          withdrawalRemaining ?? amount,
          payCurrency,
          method,
          (inr) => this.exchangeRateService.inrBudgetToUsdt(inr),
        );

    let maxPayable = businessMax;
    if (isInvestor) {
      const limitView = this.usersService.getInvestorLimitSnapshot(payer);
      maxPayable = this.capMaxPayableByInvestorLimit(
        maxPayable,
        limitView.remaining,
        payCurrency,
        method,
      );
    }

    if (amount > maxPayable) {
      throw new BadRequestException(
        p2pPayRemainingInr != null
          ? `Amount exceeds business P2P pay limit. Max payable ${maxPayable} (limit remaining ₹${p2pPayRemainingInr})`
          : `Amount exceeds max payable ${maxPayable}`,
      );
    }

    if (withdrawalRemaining != null) {
      const platformPartial = await this.platformSettingsService.allowPartialPay();
      const allowPartial = await this.businessService.resolveAllowPartialPay(
        platformPartial,
        wdBusinessId,
      );
      const partialErr = partialPayError({
        amount,
        remaining: withdrawalRemaining,
        maxPayable,
        method,
        currency: payCurrency,
        allowPartial,
      });
      if (partialErr) throw new BadRequestException(partialErr);
    }

    const breakdown = await this.computeCreditBreakdown(
      amount,
      wdBusinessId,
      payer.role === UserRole.BUSINESS || payer.role === UserRole.USER
        ? payerBusinessId
        : undefined,
      method,
      isInvestor,
      payCurrency,
    );

    // Align preview with approve: always show investor bonus when business rate is set.
    let bonusAmount = breakdown.bonusAmount;
    let netCredited = breakdown.principalCredit;
    if (isInvestor) {
      netCredited =
        Math.round((breakdown.principalCredit + bonusAmount) * 100) / 100;
    }

    return {
      ...toPayerCreditPublic({
        ...breakdown,
        bonusAmount,
        netCredited,
      }),
      maxPayable,
      p2pPayRemainingInr,
      withdrawalRemaining,
    };
  }

  private async computeCreditBreakdown(
    amount: number,
    wdBusinessId: string | undefined,
    payerBusinessId: string | undefined,
    method: PaymentMethod | undefined,
    isInvestor: boolean,
    payCurrency: string = Currency.INR,
  ) {
    let withdrawalFee = 0;
    let depositFee = 0;
    let investorBonus = 0;

    // WD fee from withdrawal-owner business (admin "Withdrawal / P2P" rate).
    if (wdBusinessId) {
      const wdTake = await this.commissionService.calculate(
        amount,
        CommissionTarget.BUSINESS,
        wdBusinessId,
        method,
        'withdrawal',
      );
      withdrawalFee = wdTake.amount;
    }

    // Deposit fee from payer's business (admin "Deposit" rate). Investors have no business.
    if (payerBusinessId) {
      const depTake = await this.commissionService.calculate(
        amount,
        CommissionTarget.BUSINESS,
        payerBusinessId,
        method,
        'deposit',
      );
      depositFee = depTake.amount;
    }

    // Fees tracked for admin/business only — NEVER deducted from payer/investor wallet.
    let commissionAmount = Math.round((withdrawalFee + depositFee) * 100) / 100;
    let principalCredit = Math.round(amount * 100) / 100;
    let bonusPercentage = 0;

    if (isInvestor && wdBusinessId) {
      const bonus = await this.commissionService.calculate(
        amount,
        CommissionTarget.INVESTOR_BONUS,
        wdBusinessId,
        method,
      );
      investorBonus = bonus.amount;
      bonusPercentage = bonus.percentage || 0;
    }

    const payIsUsdt =
      (payCurrency || '').toUpperCase() === Currency.USDT || method === PaymentMethod.USDT;
    let creditCurrency: Currency = Currency.INR;
    let exchangeRate: number | null = null;
    let payAmountInr = principalCredit;
    let bonusInPayCurrency = investorBonus;

    if (isInvestor && payIsUsdt) {
      exchangeRate = this.exchangeRateService.getUsdtInrRate();
      principalCredit = this.exchangeRateService.usdtToInr(amount);
      investorBonus = this.exchangeRateService.usdtToInr(bonusInPayCurrency);
      commissionAmount = this.exchangeRateService.usdtToInr(commissionAmount);
      withdrawalFee = this.exchangeRateService.usdtToInr(withdrawalFee);
      depositFee = this.exchangeRateService.usdtToInr(depositFee);
      payAmountInr = principalCredit;
      creditCurrency = Currency.INR;
    } else if (!isInvestor && payIsUsdt) {
      creditCurrency = Currency.USDT;
      exchangeRate = this.exchangeRateService.getUsdtInrRate();
      payAmountInr = this.exchangeRateService.usdtToInr(amount);
      withdrawalFee = this.exchangeRateService.usdtToInr(withdrawalFee);
      depositFee = this.exchangeRateService.usdtToInr(depositFee);
      commissionAmount = Math.round((withdrawalFee + depositFee) * 100) / 100;
    }

    const netCredited = Math.round((principalCredit + investorBonus) * 100) / 100;

    return {
      payAmount: amount,
      payCurrency: payIsUsdt ? Currency.USDT : Currency.INR,
      payAmountInr,
      commissionAmount,
      /** @deprecated alias — WD-owner withdrawal fee */
      businessCommission: withdrawalFee,
      /** @deprecated unused — deposit fee is separate */
      platformCommission: depositFee,
      withdrawalFee,
      depositFee,
      principalCredit: Math.max(0, principalCredit),
      bonusAmount: Math.max(0, Math.round(investorBonus * 100) / 100),
      bonusPercentage,
      bonusInPayCurrency: Math.max(0, Math.round(bonusInPayCurrency * 100) / 100),
      netCredited: Math.max(0, netCredited),
      creditCurrency,
      exchangeRate,
      isInvestor,
      businessId: wdBusinessId || null,
      payerBusinessId: payerBusinessId || null,
    };
  }

  async findAvailableForPayment(userId: string, opts: WithdrawalPaymentListOpts = {}) {
    const { page, limit, skip, search, sort } = normalizeListOpts(opts);
    const payer = await this.userModel.findById(userId).exec();
    if (!payer) throw new NotFoundException('User not found');

    const settings = await this.platformSettingsService.get();
    const isInvestor = payer.role === UserRole.INVESTOR;
    const limitView = isInvestor ? this.usersService.getInvestorLimitSnapshot(payer) : null;
    const multiplier = settings.investorPlanTargetMultiplier ?? 1.1;
    const added = limitView?.added ?? 0;
    const targetAmount =
      added > 0 ? Math.round(added * multiplier * 100) / 100 : null;

    if (isInvestor && limitView?.needsLimit) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        needsLimit: true,
        needsPlan: true,
        needsAmount: false,
        matchAmount: null,
        lots: limitView.lots,
        limitRemaining: limitView.remaining,
        limitAdded: limitView.added,
        planAmount: null,
        targetAmount: null,
        paidTowardPlan: 0,
        claimLockMinutes: settings.investorClaimLockMinutes,
        paySubmitMinutes: settings.investorPaySubmitMinutes,
      };
    }

    const isBusinessPayer = payer.role === UserRole.BUSINESS;
    /** Users/investors must enter a match budget; admin/business see the full list. */
    const requiresMatchAmount =
      payer.role === UserRole.USER || payer.role === UserRole.INVESTOR;
    const rawAmount = Number(opts.amount);
    const hasAmount = Number.isFinite(rawAmount) && rawAmount >= 1;
    if (requiresMatchAmount && !hasAmount) {
      const assignedOnly = await this.loadAssignedOpen(userId);
      return {
        items: assignedOnly.map((w) => ({
          ...this.toAvailableView(w, userId),
          maxPayable: this.getRemaining(w),
          p2pPayRemainingInr: null,
          creditIfPayFull: null,
        })),
        total: assignedOnly.length,
        page,
        limit,
        totalPages: 1,
        needsLimit: false,
        needsPlan: false,
        needsAmount: true,
        waitingForMatch: false,
        matchAmount: null,
        lots: limitView?.lots ?? [],
        limitRemaining: limitView?.remaining ?? null,
        limitAdded: limitView?.added ?? null,
        planAmount: added > 0 ? added : null,
        targetAmount,
        paidTowardPlan: isInvestor ? 0 : null,
        claimLockMinutes: settings.investorClaimLockMinutes,
        paySubmitMinutes: settings.investorPaySubmitMinutes,
      };
    }

    let matchAmount = hasAmount ? Math.round(rawAmount * 100) / 100 : null;
    if (matchAmount != null && isInvestor && limitView) {
      matchAmount = Math.min(matchAmount, limitView.remaining);
    }

    const paidTowardPlan = isInvestor ? await this.getPaidTowardPlan(userId) : null;

    const investorOwnerIds = isInvestor
      ? (
          await this.userModel
            .find({ role: UserRole.INVESTOR })
            .select('_id')
            .lean()
            .exec()
        ).map((u) => u._id)
      : [];

    // Exclude only businesses with an exhausted quota — missing/unknown businessId still shows
    const exhaustedBusinessIds =
      await this.businessService.findBusinessIdsExhaustedForP2pPay();

    const now = new Date();
    const userOid = new Types.ObjectId(userId);

    const and: Record<string, unknown>[] = [
      {
        userId: { $ne: userOid },
        status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
        p2pListStatus: 'listed',
        $expr: remainingOpenExpr(),
      },
      // Exclude active claims by others; include own claims and unlocked/expired
      {
        $or: [
          { claimLockedBy: { $exists: false } },
          { claimLockedBy: null },
          { claimLockedUntil: { $exists: false } },
          { claimLockedUntil: null },
          { claimLockedUntil: { $lte: now } },
          { claimLockedBy: userOid },
          { claimLockedBy: userId },
        ],
      },
      assignedToViewerFilter(userId),
    ];

    if (investorOwnerIds.length) {
      and.push({ userId: { $nin: investorOwnerIds } });
    }

    // Business deposit-as-payer never settles own business-origin payout WDs.
    if (isBusinessPayer) {
      and.push({
        $or: [{ origin: { $exists: false } }, { origin: { $ne: 'business' } }],
      });
    }

    // Business payer skips exhausted P2P quota filter (they settle without consuming quota).
    if (!isBusinessPayer && exhaustedBusinessIds.length > 0) {
      and.push({
        $or: [
          { origin: 'business' },
          { businessId: { $exists: false } },
          { businessId: null },
          { businessId: { $nin: exhaustedBusinessIds } },
        ],
      });
    }

    if (opts.method && opts.method !== 'all') {
      and.push({ method: opts.method as PaymentMethod });
    }
    if (matchAmount != null) {
      const remainingExpr = {
        $subtract: [
          '$amount',
          {
            $add: [
              { $ifNull: ['$paidAmount', 0] },
              { $ifNull: ['$reservedAmount', 0] },
            ],
          },
        ],
      };
      // Full close if remaining <= budget, or valid partial (min ₹5k / 5 USDT,
      // leftover also >= min so dust amounts are not created).
      and.push({
        $expr: {
          $or: [
            { $lte: [remainingExpr, matchAmount] },
            {
              $and: [
                { $eq: ['$method', PaymentMethod.USDT] },
                { $gte: [matchAmount, MIN_PARTIAL_USDT] },
                { $gte: [remainingExpr, matchAmount + MIN_PARTIAL_USDT] },
              ],
            },
            {
              $and: [
                { $ne: ['$method', PaymentMethod.USDT] },
                { $gte: [matchAmount, MIN_PARTIAL_INR] },
                { $gte: [remainingExpr, matchAmount + MIN_PARTIAL_INR] },
              ],
            },
          ],
        },
      });
    }
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { 'upiDetails.upiId': { $regex: search, $options: 'i' } },
          { 'bankDetails.accountNumber': { $regex: search, $options: 'i' } },
          { 'bankDetails.accountHolderName': { $regex: search, $options: 'i' } },
          { 'usdtDetails.walletAddress': { $regex: search, $options: 'i' } },
        ],
      });
    }

    // Business deposit: prefer this business's USER withdrawals, else investor WDs.
    if (isBusinessPayer) {
      const payerBizId = await this.businessService.findBusinessIdForUser(payer);
      const bizOid =
        payerBizId && Types.ObjectId.isValid(payerBizId)
          ? new Types.ObjectId(payerBizId)
          : null;
      const businessUserIds = bizOid
        ? (
            await this.userModel
              .find({
                role: UserRole.USER,
                $or: [
                  { referredByBusiness: bizOid },
                  { staffBusinessId: bizOid },
                ],
              })
              .select('_id')
              .lean()
              .exec()
          ).map((u) => u._id)
        : [];
      const allInvestorIds = (
        await this.userModel
          .find({ role: UserRole.INVESTOR })
          .select('_id')
          .lean()
          .exec()
      ).map((u) => u._id);

      if (bizOid && businessUserIds.length) {
        const preferUsers = [
          ...and,
          {
            businessId: { $in: [bizOid, payerBizId] },
            userId: { $in: businessUserIds },
          },
        ];
        const userWdCount = await this.withdrawalModel
          .countDocuments({ $and: preferUsers })
          .exec();
        if (userWdCount > 0) {
          and.push({
            businessId: { $in: [bizOid, payerBizId] },
            userId: { $in: businessUserIds },
          });
        } else if (allInvestorIds.length) {
          and.push({ userId: { $in: allInvestorIds } });
        } else {
          // No user/investor pool — force empty.
          and.push({ _id: { $exists: false } });
        }
      } else if (allInvestorIds.length) {
        and.push({ userId: { $in: allInvestorIds } });
      } else {
        and.push({ _id: { $exists: false } });
      }
    } else {
      // Prefer business-origin / non-investor WDs when platform B2B preference is on (#32/#50)
      const preferB2b = await this.platformSettingsService.preferB2bSettlement();
      if (preferB2b && !isInvestor) {
        const preferBiz = [
          ...and,
          {
            $or: [{ origin: { $exists: false } }, { origin: { $ne: 'investor' } }],
          },
        ];
        const bizCount = await this.withdrawalModel
          .countDocuments({ $and: preferBiz })
          .exec();
        if (bizCount > 0) {
          and.push({
            $or: [{ origin: { $exists: false } }, { origin: { $ne: 'investor' } }],
          });
        }
      }
    }

    const filter = { $and: and };
    // Priority jumps FIFO; users: oldest first; investors: newest first.
    const sortSpec: Record<string, 1 | -1> =
      matchAmount != null && (!opts.sort || opts.sort === 'newest' || opts.sort === 'oldest')
        ? isInvestor
          ? { priority: -1, createdAt: -1 }
          : { priority: -1, createdAt: 1 }
        : listSortMap(sort, {
            newest: { priority: -1, createdAt: -1 },
            oldest: { priority: -1, createdAt: 1 },
            amount_desc: { priority: -1, amount: -1 },
            amount_asc: { priority: -1, amount: 1 },
            status: { priority: -1, status: 1, createdAt: -1 },
          });

    const [rawItems, total] = await Promise.all([
      this.withdrawalModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.withdrawalModel.countDocuments(filter).exec(),
    ]);

    let items = rawItems;
    if (skip === 0) {
      const assignedDocs = await this.loadAssignedOpen(userId);
      if (assignedDocs.length) {
        const seen = new Set(assignedDocs.map((w) => w._id.toString()));
        items = [...assignedDocs, ...rawItems.filter((w) => !seen.has(w._id.toString()))];
      }
    }

    // Clear stale claim fields on read
    for (const w of items) {
      if (
        w.claimLockedUntil &&
        w.claimLockedUntil.getTime() <= now.getTime() &&
        (w.claimLockedBy || w.claimPayDeadline)
      ) {
        w.set('claimLockedBy', null);
        w.set('claimLockedUntil', null);
        w.set('claimPayDeadline', null);
        await w.save();
        await this.clearClaimRedis(w._id.toString());
      }
    }

    // Source-of-truth for locked: active (non-disputed) pending payment sums
    const pendingByWd = await this.paymentModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      {
        $match: {
          withdrawalId: { $in: items.map((w) => w._id) },
          status: TransactionStatus.PENDING,
          $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
        },
      },
      { $group: { _id: '$withdrawalId', total: { $sum: '$amount' } } },
    ]);
    const pendingMap = new Map(pendingByWd.map((r) => [r._id.toString(), r.total]));

    for (const w of items) {
      const reserved = pendingMap.get(w._id.toString()) || 0;
      if ((w.reservedAmount || 0) !== reserved) {
        w.reservedAmount = reserved;
        await w.save();
      }
    }

    const payerBusinessId = await this.businessService.findBusinessIdForUser(payer);

    const itemsWithCredit = await Promise.all(
      items.map(async (w) => {
        const view = this.toAvailableView(w, userId);
        const remaining = view.remainingAmount;
        if (remaining <= 0) {
          return {
            ...view,
            maxPayable: 0,
            p2pPayRemainingInr: null,
            creditIfPayFull: null,
          };
        }
        const businessId = w.businessId?.toString() || payerBusinessId;
        const { maxPayable: businessMax, p2pPayRemainingInr } =
          w.origin === 'business' || isBusinessPayer
            ? { maxPayable: remaining, p2pPayRemainingInr: null }
            : await this.businessService.getMaxPayableAmount(
                businessId,
                remaining,
                w.currency,
                w.method,
                (inr) => this.exchangeRateService.inrBudgetToUsdt(inr),
              );

        let maxPayable = businessMax;
        if (isInvestor && limitView) {
          maxPayable = this.capMaxPayableByInvestorLimit(
            maxPayable,
            limitView.remaining,
            w.currency,
            w.method,
          );
        }

        if (maxPayable <= 0) {
          return {
            ...view,
            maxPayable: 0,
            p2pPayRemainingInr,
            creditIfPayFull: null,
          };
        }

        const credit = await this.computeCreditBreakdown(
          maxPayable,
          businessId,
          isInvestor ? undefined : payerBusinessId,
          w.method,
          !!isInvestor,
          w.currency,
        );
        const shownBonus = visibleInvestorBonusAmount({
          viewerRole: payer.role,
          bonusAmount: credit.bonusAmount,
        });
        return {
          ...view,
          maxPayable,
          p2pPayRemainingInr,
          // Never include platform/business fee cuts for payer-facing estimates.
          creditIfPayFull: toPayerCreditPublic({
            ...credit,
            bonusAmount: shownBonus,
            netCredited:
              Math.round((credit.principalCredit + shownBonus) * 100) / 100,
          }),
        };
      }),
    );

    return {
      items: itemsWithCredit,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      needsLimit: false,
      needsPlan: false,
      needsAmount: false,
      waitingForMatch: hasAmount && itemsWithCredit.length === 0,
      matchAmount,
      lots: limitView?.lots ?? [],
      limitRemaining: limitView?.remaining ?? null,
      limitAdded: limitView?.added ?? null,
      planAmount: added > 0 ? added : null,
      targetAmount,
      paidTowardPlan,
      claimLockMinutes: settings.investorClaimLockMinutes,
      paySubmitMinutes: settings.investorPaySubmitMinutes,
      showCommissionToInvestor: true,
      allowMobileNumberUpi: !!settings.allowMobileNumberUpi,
    };
  }

  /**
   * Claim a listed withdrawal for exclusive pay window (USER / INVESTOR payers).
   * Hold hides it from others until claimLockedUntil (default 7 min).
   * Payer submit TAT is claimPayDeadline (default 5 min).
   * Atomic so two Pay clicks cannot both succeed.
   */
  async claimWithdrawal(userId: string, withdrawalId: string) {
    const payer = await this.userModel.findById(userId).exec();
    if (!payer) throw new NotFoundException('User not found');
    if (
      payer.role !== UserRole.USER &&
      payer.role !== UserRole.INVESTOR &&
      payer.role !== UserRole.BUSINESS &&
      payer.role !== UserRole.ADMIN &&
      payer.role !== UserRole.SUB_ADMIN
    ) {
      throw new ForbiddenException('Not allowed to claim withdrawals for payment');
    }

    if (payer.role === UserRole.INVESTOR) {
      const limitView = this.usersService.getInvestorLimitSnapshot(payer);
      if (limitView.needsLimit) {
        throw new BadRequestException('Add a pay-limit amount first');
      }
    }

    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    if (payer.role === UserRole.BUSINESS && withdrawal.origin === 'business') {
      throw new BadRequestException(
        'Business payout withdrawals cannot be used for platform deposit',
      );
    }

    if (withdrawal.userId.toString() === userId) {
      throw new BadRequestException('Cannot claim your own withdrawal');
    }

    await this.assertNotInvestorToInvestor(payer.role, withdrawal.userId.toString());

    if (
      withdrawal.status !== TransactionStatus.PENDING &&
      withdrawal.status !== TransactionStatus.PROCESSING
    ) {
      throw new BadRequestException('Withdrawal is not open for payments');
    }

    if (!isOpenOnPayList(withdrawal)) {
      throw new BadRequestException(
        'Withdrawal is waiting for business/admin approval before it can be paid',
      );
    }

    if (isAssignedToOther(withdrawal.assignedTo, userId)) {
      throw new BadRequestException('This withdrawal is assigned to another payer');
    }

    if (this.getRemaining(withdrawal) <= 0) {
      throw new BadRequestException('Withdrawal has no remaining amount');
    }

    const now = new Date();
    const lockedByOther =
      withdrawal.claimLockedBy &&
      withdrawal.claimLockedUntil &&
      withdrawal.claimLockedUntil.getTime() > now.getTime() &&
      withdrawal.claimLockedBy.toString() !== userId;

    if (lockedByOther) {
      throw new BadRequestException(
        'This withdrawal is temporarily claimed by another payer. Try again later.',
      );
    }

    const claimLockMs = await this.platformSettingsService.getClaimLockMs();
    const paySubmitMs = await this.platformSettingsService.getPaySubmitMs();
    const claimLockedUntil = new Date(now.getTime() + claimLockMs);
    const claimPayDeadline = new Date(now.getTime() + paySubmitMs);
    const userOid = new Types.ObjectId(userId);

    const claimed = await this.withdrawalModel
      .findOneAndUpdate(
        {
          _id: withdrawal._id,
          status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
          p2pListStatus: 'listed',
          $or: [
            { claimLockedBy: { $exists: false } },
            { claimLockedBy: null },
            { claimLockedUntil: { $exists: false } },
            { claimLockedUntil: null },
            { claimLockedUntil: { $lte: now } },
            { claimLockedBy: userOid },
            { claimLockedBy: userId },
          ],
        },
        {
          $set: {
            claimLockedBy: userOid,
            claimLockedUntil,
            claimPayDeadline,
          },
        },
        { new: true },
      )
      .exec();

    if (!claimed) {
      throw new BadRequestException(
        'This withdrawal is temporarily claimed by another payer. Try again later.',
      );
    }

    await this.setClaimRedis(withdrawalId, userId, Math.ceil(claimLockMs / 1000));
    this.p2pRealtime.emitListChanged('claimed', {
      withdrawalId,
      claimedBy: userId,
    });

    return {
      ...this.toAvailableView(claimed),
      claimLockedBy: userId,
      claimLockedUntil,
      claimPayDeadline,
      claimLockMs,
      paySubmitMs,
    };
  }

  /** Drop expired holds so the item returns to every payer list. */
  async releaseExpiredClaims() {
    const now = new Date();
    const expired = await this.withdrawalModel
      .find({
        claimLockedBy: { $ne: null, $exists: true },
        claimLockedUntil: { $lte: now },
      })
      .select('_id')
      .lean()
      .exec();

    if (!expired.length) return 0;

    const ids = expired.map((row) => row._id);
    await this.withdrawalModel
      .updateMany(
        { _id: { $in: ids } },
        {
          $set: {
            claimLockedBy: null,
            claimLockedUntil: null,
            claimPayDeadline: null,
          },
        },
      )
      .exec();

    for (const row of expired) {
      await this.clearClaimRedis(row._id.toString());
    }
    this.p2pRealtime.emitListChanged('released');
    return expired.length;
  }

  async findById(withdrawalId: string, userId?: string) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    const payments = await this.paymentModel
      .find({ withdrawalId: withdrawal._id })
      .sort({ createdAt: -1 })
      .exec();

    const isOwner = withdrawal.userId.toString() === userId;
    const remaining = this.getRemaining(withdrawal);
    const viewer = userId
      ? await this.userModel.findById(userId).select('role').lean().exec()
      : null;
    const hideFees =
      viewer?.role === UserRole.USER || viewer?.role === UserRole.INVESTOR;

    const base = {
      ...withdrawal.toObject(),
      remainingAmount: remaining,
      payments: payments.map((p) => {
        const raw = {
          ...p.toObject(),
          utr:
            isOwner || p.payerUserId.toString() === userId
              ? p.utr
              : this.maskUtr(p.utr),
        } as Record<string, unknown>;
        return hideFees ? toPayerPaymentPublic(raw) : raw;
      }),
    };
    if (!hideFees) return base;
    const {
      commissionAmount: _wc,
      ...rest
    } = base as typeof base & { commissionAmount?: unknown };
    return rest;
  }

  async submitPayment(payerUserId: string, withdrawalId: string, dto: SubmitWithdrawalPaymentDto) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    if (withdrawal.userId.toString() === payerUserId) {
      throw new BadRequestException('Cannot pay your own withdrawal');
    }

    if (
      withdrawal.status !== TransactionStatus.PENDING &&
      withdrawal.status !== TransactionStatus.PROCESSING
    ) {
      throw new BadRequestException('Withdrawal is not open for payments');
    }

    if (!isOpenOnPayList(withdrawal)) {
      throw new BadRequestException(
        'Withdrawal is waiting for business/admin approval before it can be paid',
      );
    }

    const assignedToMe = isAssignedToPayer(withdrawal.assignedTo, payerUserId);
    if (isAssignedToOther(withdrawal.assignedTo, payerUserId)) {
      const rolePeek = await this.userModel.findById(payerUserId).select('role').lean().exec();
      const adminPayer =
        rolePeek?.role === UserRole.ADMIN || rolePeek?.role === UserRole.SUB_ADMIN;
      if (!adminPayer) {
        throw new BadRequestException('This withdrawal is assigned to another payer');
      }
    }

    const now = new Date();
    const claimActive =
      !!withdrawal.claimLockedBy &&
      !!withdrawal.claimLockedUntil &&
      withdrawal.claimLockedUntil.getTime() > now.getTime();

    if (!assignedToMe && claimActive && withdrawal.claimLockedBy!.toString() !== payerUserId) {
      throw new BadRequestException(
        'This withdrawal is temporarily claimed by another payer. Try again later.',
      );
    }

    if (
      !assignedToMe &&
      claimActive &&
      withdrawal.claimLockedBy!.toString() === payerUserId &&
      withdrawal.claimPayDeadline &&
      now.getTime() > withdrawal.claimPayDeadline.getTime()
    ) {
      throw new BadRequestException(
        'Payment submit window expired. Claim again to continue.',
      );
    }

    // Auto-claim if unlocked so lock + pay deadline start on first submit
    if (!assignedToMe && !claimActive) {
      const claimLockMs = await this.platformSettingsService.getClaimLockMs();
      const paySubmitMs = await this.platformSettingsService.getPaySubmitMs();
      withdrawal.claimLockedBy = new Types.ObjectId(payerUserId);
      withdrawal.claimLockedUntil = new Date(now.getTime() + claimLockMs);
      withdrawal.claimPayDeadline = new Date(now.getTime() + paySubmitMs);
      await this.setClaimRedis(withdrawalId, payerUserId, Math.ceil(claimLockMs / 1000));
    }

    const remaining = this.getRemaining(withdrawal);
    if (dto.amount > remaining) {
      throw new BadRequestException(`Amount exceeds remaining ${remaining}`);
    }

    const pendingExists = await this.paymentModel.exists({
      withdrawalId: withdrawal._id,
      payerUserId: new Types.ObjectId(payerUserId),
      status: TransactionStatus.PENDING,
      $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
    });
    if (pendingExists) {
      throw new BadRequestException('You already have a pending payment on this withdrawal');
    }

    const isUsdtPayout = withdrawal.method === PaymentMethod.USDT;
    const refRaw = dto.utr?.trim() ?? '';
    const hasSlip = !!dto.proofImageKey;
    if (assignedToMe && !refRaw && !hasSlip) {
      throw new BadRequestException('Submit UTR or upload a payment slip');
    }
    if (!assignedToMe && !refRaw) {
      throw new BadRequestException('UTR / TxID is required');
    }
    const slipRef =
      !refRaw && hasSlip
        ? `SLIP${payerUserId.slice(-8).toUpperCase()}${String(Date.now()).slice(-6)}`
        : '';
    const refErr = refRaw ? paymentRefErrorForMethod(refRaw, withdrawal.method) : null;
    if (refErr) throw new BadRequestException(refErr);
    const utrNorm = refRaw
      ? isUsdtPayout
        ? String(normalizeTxHash(refRaw))
        : String(normalizeUtr(refRaw))
      : slipRef;
    await assertUniquePaymentRef({
      paymentModel: this.paymentModel,
      withdrawalModel: this.withdrawalModel,
      ref: utrNorm,
      isUsdt: isUsdtPayout,
    });

    if (dto.proofImageKey) {
      this.storageService.validateProofKey(dto.proofImageKey, payerUserId);
    }

    const payer = await this.userModel.findById(payerUserId).exec();
    await this.assertNotInvestorToInvestor(payer?.role, withdrawal.userId.toString());
    const isAdminPayer =
      payer?.role === UserRole.ADMIN || payer?.role === UserRole.SUB_ADMIN;
    const isBusinessPayer = payer?.role === UserRole.BUSINESS;
    if (isBusinessPayer && withdrawal.origin === 'business') {
      throw new BadRequestException(
        'Business payout withdrawals cannot be used for platform deposit',
      );
    }
    if (!assignedToMe && !dto.proofImageKey && !isAdminPayer) {
      throw new BadRequestException('Payment proof is required');
    }
    const isBusinessOrigin = withdrawal.origin === 'business';
    // Prefer withdrawal's business (P2P flow) so admin "Set Commission" on that business applies
    const payerBusinessId = await this.businessService.findBusinessIdForUser(payer);
    const businessId = withdrawal.businessId?.toString() || payerBusinessId;
    const isInvestor = payer?.role === UserRole.INVESTOR;
    const investorLimit = isInvestor && payer
      ? this.usersService.getInvestorLimitSnapshot(payer)
      : null;
    // Business deposit-as-payer never consumes / restores P2P pay quota.
    const skipP2pPayQuota = isBusinessPayer;

    if (isInvestor && investorLimit?.needsLimit) {
      throw new BadRequestException('Add a pay-limit amount first');
    }

    let maxPayable = remaining;
    let p2pPayRemainingInr: number | null = null;
    if (!isBusinessOrigin && !skipP2pPayQuota) {
      const cap = await this.businessService.getMaxPayableAmount(
        businessId,
        remaining,
        withdrawal.currency,
        withdrawal.method,
        (inr) => this.exchangeRateService.inrBudgetToUsdt(inr),
      );
      maxPayable = cap.maxPayable;
      p2pPayRemainingInr = cap.p2pPayRemainingInr;
    }
    if (isInvestor && investorLimit) {
      maxPayable = this.capMaxPayableByInvestorLimit(
        maxPayable,
        investorLimit.remaining,
        withdrawal.currency,
        withdrawal.method,
      );
    }
    if (dto.amount > maxPayable) {
      throw new BadRequestException(
        isInvestor && investorLimit
          ? `Amount exceeds investor pay limit. Max payable ${maxPayable} (limit remaining ₹${investorLimit.remaining})`
          : p2pPayRemainingInr != null
            ? `Amount exceeds business P2P pay limit. Max payable ${maxPayable} (limit remaining ₹${p2pPayRemainingInr})`
            : `Amount exceeds max payable ${maxPayable}`,
      );
    }

    if (!isAdminPayer) {
      const platformPartial = await this.platformSettingsService.allowPartialPay();
      const allowPartial = await this.businessService.resolveAllowPartialPay(
        platformPartial,
        businessId,
      );
      const partialErr = partialPayError({
        amount: dto.amount,
        remaining,
        maxPayable,
        method: withdrawal.method,
        currency: withdrawal.currency,
        allowPartial,
      });
      if (partialErr) throw new BadRequestException(partialErr);
    }

    const estimate = await this.computeCreditBreakdown(
      dto.amount,
      businessId,
      isInvestor ? undefined : payerBusinessId,
      withdrawal.method,
      !!isInvestor,
      withdrawal.currency,
    );

    // Business P2P limit is INR — convert USDT pays to INR for limit accounting
    const limitConsumeAmount = Math.round(estimate.payAmountInr * 100) / 100;

    // Quota for the WD was reserved at list-for-P2P time — do not reserve again on submit.
    // Investor plan limit is still consumed here.
    if (isInvestor) {
      await this.usersService.consumeInvestorLimit(payerUserId, limitConsumeAmount);
    }

    const referenceId = `WDP-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const autoApproveAt = new Date(Date.now() + VERIFICATION_WINDOW_MS);

    let payment;
    try {
      payment = await this.paymentModel.create({
        referenceId,
        withdrawalId: withdrawal._id,
        payerUserId: new Types.ObjectId(payerUserId),
        businessId: businessId ? new Types.ObjectId(businessId) : undefined,
        payerBusinessId: payerBusinessId
          ? new Types.ObjectId(payerBusinessId)
          : undefined,
        amount: dto.amount,
        currency: withdrawal.currency,
        utr: utrNorm,
        proofImageKey: dto.proofImageKey,
        proofImageUrl: dto.proofImageUrl,
        status: TransactionStatus.PENDING,
        autoApproveAt,
        estimatedCommissionAmount: estimate.commissionAmount,
        estimatedBonusAmount: estimate.bonusAmount,
        estimatedNetCredited: estimate.netCredited,
      });
    } catch (err) {
      if (isInvestor) {
        await this.usersService.restoreInvestorLimit(payerUserId, limitConsumeAmount);
      }
      throw err;
    }

    // Reserve immediately → Open ↓, Locked ↑ on the request card
    withdrawal.reservedAmount = (withdrawal.reservedAmount || 0) + dto.amount;
    withdrawal.status = TransactionStatus.PROCESSING;
    // Clear claim so remaining open amount can be claimed by others (lock already served its purpose)
    withdrawal.set('claimLockedBy', null);
    withdrawal.set('claimLockedUntil', null);
    withdrawal.set('claimPayDeadline', null);
    await withdrawal.save();
    await this.clearClaimRedis(withdrawalId);
    this.p2pRealtime.emitListChanged('updated', { withdrawalId });

    const note = paymentReceivedNotification({
      payAmount: dto.amount,
      paidAmount: withdrawal.paidAmount || 0,
      reservedAmount: withdrawal.reservedAmount || 0,
      withdrawalAmount: withdrawal.amount,
      referenceId: withdrawal.referenceId,
    });
    await this.notificationService.send(
      withdrawal.userId.toString(),
      note.title,
      note.body,
      'info',
      'withdrawal',
      withdrawal._id.toString(),
    );

    return toPayerPaymentPublic(
      payment.toObject() as unknown as Record<string, unknown>,
    );
  }

  async findMyPayments(userId: string, opts: WithdrawalPaymentListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [
      {
        $or: [
          { payerUserId: new Types.ObjectId(userId) },
          { payerUserId: userId },
        ],
      },
    ];

    if (status) and.push({ status });
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { utr: { $regex: search, $options: 'i' } },
          { notes: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = { $and: and };
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.paymentModel.find(filter).skip(skip).limit(limit).sort(sortSpec).lean().exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);
    return {
      items: items.map((p) =>
        toPayerPaymentPublic(p as unknown as Record<string, unknown>),
      ),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  /** User home dashboard: deposit + withdrawal status counts and amounts. */
  async getUserDashboardSummary(userId: string) {
    const uid = new Types.ObjectId(userId);
    const payerMatch = {
      $or: [{ payerUserId: uid }, { payerUserId: userId }],
    };
    const ownerMatch = {
      $or: [{ userId: uid }, { userId }],
    };

    type StatusRow = {
      _id: string;
      count: number;
      amount: number;
      credited?: number;
      paid?: number;
    };

    const [
      depositRows,
      withdrawalRows,
      openRemainingAgg,
      awaitingConfirmAgg,
      recentDeposits,
      recentWithdrawals,
    ] = await Promise.all([
      this.paymentModel
        .aggregate<StatusRow>([
          { $match: payerMatch },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
              credited: { $sum: { $ifNull: ['$netCreditedAmount', 0] } },
            },
          },
        ])
        .exec(),
      this.withdrawalModel
        .aggregate<StatusRow>([
          { $match: ownerMatch },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
              paid: { $sum: { $ifNull: ['$paidAmount', 0] } },
            },
          },
        ])
        .exec(),
      this.withdrawalModel
        .aggregate<{ count: number; remainingAmount: number }>([
          {
            $match: {
              $and: [
                ownerMatch,
                {
                  status: {
                    $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
                  },
                },
              ],
            },
          },
          {
            $project: {
              remaining: {
                $max: [
                  0,
                  {
                    $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              remainingAmount: { $sum: '$remaining' },
            },
          },
        ])
        .exec(),
      this.paymentModel
        .aggregate<{ count: number; amount: number }>([
          {
            $match: {
              status: TransactionStatus.PENDING,
              $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
            },
          },
          {
            $lookup: {
              from: 'withdrawals',
              localField: 'withdrawalId',
              foreignField: '_id',
              as: 'w',
            },
          },
          { $unwind: '$w' },
          {
            $match: {
              $or: [{ 'w.userId': uid }, { 'w.userId': userId }],
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
      this.paymentModel
        .find(payerMatch)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('referenceId amount currency status utr netCreditedAmount createdAt')
        .lean()
        .exec(),
      this.withdrawalModel
        .find(ownerMatch)
        .sort({ createdAt: -1 })
        .limit(5)
        .select(
          'referenceId amount paidAmount currency status method createdAt p2pListStatus',
        )
        .lean()
        .exec(),
    ]);

    const dep = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      rejected: 0,
    };
    let depositCount = 0;
    let completedDepositAmount = 0;
    let pendingDepositAmount = 0;
    let creditedAmount = 0;
    for (const row of depositRows) {
      depositCount += row.count;
      if (row._id in dep) dep[row._id as keyof typeof dep] = row.count;
      if (row._id === TransactionStatus.COMPLETED) {
        completedDepositAmount += row.amount;
        creditedAmount += row.credited ?? 0;
      }
      if (
        row._id === TransactionStatus.PENDING ||
        row._id === TransactionStatus.PROCESSING
      ) {
        pendingDepositAmount += row.amount;
      }
    }

    const wd = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      rejected: 0,
    };
    let withdrawalCount = 0;
    let completedWithdrawalAmount = 0;
    let totalWithdrawalRequested = 0;
    for (const row of withdrawalRows) {
      withdrawalCount += row.count;
      totalWithdrawalRequested += row.amount;
      if (row._id in wd) wd[row._id as keyof typeof wd] = row.count;
      if (row._id === TransactionStatus.COMPLETED) {
        completedWithdrawalAmount += row.amount;
      }
    }

    const openRemaining = openRemainingAgg[0];
    const awaitingConfirm = awaitingConfirmAgg[0];
    const pendingDeposits = dep.pending + dep.processing;
    const openWithdrawals = wd.pending + wd.processing;

    return {
      deposits: {
        total: depositCount,
        completed: dep.completed,
        pendingVerification: pendingDeposits,
        rejected: dep.rejected,
        failed: dep.failed,
        cancelled: dep.cancelled,
        completedAmount: completedDepositAmount,
        pendingAmount: pendingDepositAmount,
        creditedAmount,
      },
      withdrawals: {
        total: withdrawalCount,
        completed: wd.completed,
        open: openWithdrawals,
        remainingAmount: openRemaining?.remainingAmount ?? 0,
        remainingCount: openRemaining?.count ?? 0,
        rejected: wd.rejected,
        cancelled: wd.cancelled,
        failed: wd.failed,
        completedAmount: completedWithdrawalAmount,
        requestedAmount: totalWithdrawalRequested,
        awaitingConfirmCount: awaitingConfirm?.count ?? 0,
        awaitingConfirmAmount: awaitingConfirm?.amount ?? 0,
      },
      recentDeposits,
      recentWithdrawals,
    };
  }

  /** Payments related to a business: WD owned by biz OR paid by that biz's users. */
  async findForBusinessOwner(ownerUserId: string, opts: WithdrawalPaymentListOpts = {}) {
    const business = await this.businessService.findForActor(ownerUserId);
    return this.findForBusiness(business._id.toString(), opts);
  }

  async findForBusiness(businessId: string, opts: WithdrawalPaymentListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const bid = new Types.ObjectId(businessId);
    const and: Record<string, unknown>[] = [
      {
        $or: [
          { businessId: bid },
          { payerBusinessId: bid },
        ],
      },
    ];
    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') {
      const matchingWithdrawals = await this.withdrawalModel
        .find({
          $or: [{ businessId: bid }, { businessId: businessId }],
          method: opts.method as PaymentMethod,
        })
        .select('_id')
        .lean()
        .exec();
      and.push({ withdrawalId: { $in: matchingWithdrawals.map((w) => w._id) } });
    }
    if (search) {
      const matchingWithdrawals = await this.withdrawalModel
        .find({
          $or: [{ businessId: bid }, { businessId: businessId }],
          referenceId: { $regex: search, $options: 'i' },
        })
        .select('_id')
        .lean()
        .exec();
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { utr: { $regex: search, $options: 'i' } },
          { withdrawalId: { $in: matchingWithdrawals.map((w) => w._id) } },
        ],
      });
    }
    const filter = { $and: and };
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
    });
    const [items, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .populate({
          path: 'withdrawalId',
          select:
            'referenceId method amount currency userId businessId status paidAmount remainingAmount upiDetails bankDetails usdtDetails createdAt completedAt p2pListStatus origin',
          populate: [
            {
              path: 'userId',
              select: 'name email phone role status businessUserCode externalRef',
            },
            {
              path: 'businessId',
              select: 'name slug referralCode',
            },
          ],
        })
        .populate('payerUserId', 'name email phone role status businessUserCode externalRef')
        .skip(skip)
        .limit(limit)
        .sort(sortSpec)
        .exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findPending(opts: WithdrawalPaymentListOpts = {}) {
    return this.findAllPayments({
      ...opts,
      status: opts.status || TransactionStatus.PENDING,
    });
  }

  async findAllPayments(opts: WithdrawalPaymentListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [];

    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') {
      // method lives on parent withdrawal — filter via matching withdrawal ids
      const matchingWithdrawals = await this.withdrawalModel
        .find({ method: opts.method as PaymentMethod })
        .select('_id')
        .lean()
        .exec();
      and.push({
        withdrawalId: { $in: matchingWithdrawals.map((w) => w._id) },
      });
    }
    if (opts.payType === 'partial' || opts.payType === 'full') {
      const payTypeIds = await this.paymentModel
        .aggregate<{ _id: Types.ObjectId }>([
          {
            $lookup: {
              from: 'withdrawals',
              localField: 'withdrawalId',
              foreignField: '_id',
              as: 'wd',
            },
          },
          { $unwind: '$wd' },
          {
            $match:
              opts.payType === 'partial'
                ? { $expr: { $lt: ['$amount', '$wd.amount'] } }
                : { $expr: { $gte: ['$amount', '$wd.amount'] } },
          },
          { $project: { _id: 1 } },
        ])
        .exec();
      and.push({ _id: { $in: payTypeIds.map((r) => r._id) } });
    }
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { utr: { $regex: search, $options: 'i' } },
          { notes: { $regex: search, $options: 'i' } },
          { rejectionReason: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sortSpec)
        .populate({
          path: 'withdrawalId',
          select:
            'referenceId method amount currency userId businessId status paidAmount remainingAmount upiDetails bankDetails usdtDetails createdAt completedAt p2pListStatus origin',
          populate: [
            {
              path: 'userId',
              select: 'name email phone role status businessUserCode externalRef',
            },
            {
              path: 'businessId',
              select: 'name slug referralCode',
            },
          ],
        })
        .populate('payerUserId', 'name email phone role status businessUserCode externalRef')
        .exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async approvePayment(
    paymentId: string,
    processedBy: string,
    actorId?: string,
    notes?: string,
  ) {
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Payment is not pending');
    }

    const withdrawal = await this.withdrawalModel.findById(payment.withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    // This payment is already in reservedAmount — include it in available headroom
    const availableForThis = this.getRemaining(withdrawal) + payment.amount;
    if (payment.amount > availableForThis) {
      throw new BadRequestException('Payment exceeds withdrawal remaining amount');
    }

    const payer = await this.userModel.findById(payment.payerUserId).exec();
    const isInvestor = payer?.role === UserRole.INVESTOR;
    const isBusinessPayer = payer?.role === UserRole.BUSINESS;
    const creditField = isInvestor ? 'totalInvested' : 'totalDeposited';
    const ledgerType = isInvestor ? LedgerType.INVESTMENT : LedgerType.DEPOSIT;

    const breakdown = await this.computeCreditBreakdown(
      payment.amount,
      payment.businessId?.toString(),
      isInvestor
        ? undefined
        : payment.payerBusinessId?.toString() ||
            (await this.businessService.findBusinessIdForUser(payer)) ||
            undefined,
      withdrawal.method,
      !!isInvestor,
      payment.currency || withdrawal.currency,
    );

    const withdrawalFee = breakdown.withdrawalFee || breakdown.businessCommission || 0;
    const depositFee = breakdown.depositFee || breakdown.platformCommission || 0;
    const businessCommission = withdrawalFee;
    const totalCommission = breakdown.commissionAmount;
    const investorBonus = breakdown.bonusAmount;
    const principalCredit = breakdown.principalCredit;
    const netAmount = breakdown.netCredited;
    const creditCurrency = breakdown.creditCurrency;

    const payerWallet = await this.walletService.getOrCreate(
      payment.payerUserId.toString(),
      creditCurrency,
      payment.businessId?.toString(),
    );
    const balanceBefore = payerWallet.balance;

    // Dispute frees P2P quota so others can pay — reclaim it when admin resolves as approved.
    const payerBizIdEarly =
      payment.payerBusinessId?.toString() ||
      (await this.businessService.findBusinessIdForUser(payer));
    // Business deposit-as-payer never consumes / restores P2P pay quota.
    const skipP2pPayQuota = isBusinessPayer;

    // Dispute no longer releases list-quota — nothing to re-reserve on approve.
    if (payment.disputedAt && isInvestor) {
      try {
        await this.usersService.consumeInvestorLimit(
          payment.payerUserId.toString(),
          this.paymentLimitInr(payment),
        );
      } catch (err) {
        throw err;
      }
    }

    if (payment.businessId) {
      await this.businessService.incrementStats(
        payment.businessId.toString(),
        'totalDeposits',
        breakdown.payAmountInr,
      );
      if (businessCommission > 0) {
        await this.businessService.incrementStats(
          payment.businessId.toString(),
          'totalCommissionEarned',
          businessCommission,
        );
      }
    }

    const payerBizId =
      payment.payerBusinessId?.toString() ||
      payerBizIdEarly ||
      (await this.businessService.findBusinessIdForUser(payer));
    if (payerBizId && !payment.payerBusinessId) {
      payment.payerBusinessId = new Types.ObjectId(payerBizId);
    }

    const wdBizId = payment.businessId?.toString();
    const payInr = breakdown.payAmountInr;

    // Limit math:
    // 1) Release list reserve for USER/BUSINESS payers only — restores WD-owner remaining.
    //    Investor pays must NOT increase business remaining (keep list reserve consumed).
    // 2) If payer business ≠ WD owner → earned +pay on payer (never for investors / business-as-payer)
    // 3) Fees consume from respective businesses' limits (below)
    if (wdBizId && withdrawal.origin !== 'business' && !isInvestor) {
      await this.businessService.releaseP2pPay(wdBizId, payInr, {
        referenceType: 'withdrawal_payment',
        referenceId: payment._id.toString(),
      });
    }
    if (
      !isInvestor &&
      payerBizId &&
      !skipP2pPayQuota &&
      (!wdBizId || payerBizId !== wdBizId)
    ) {
      await this.businessService.creditP2pPayQuota(payerBizId, payInr, {
        referenceType: 'withdrawal_payment',
        referenceId: payment._id.toString(),
      });
    }

    // Regular users (not investors / business): mirror deposit onto partner site when configured.
    // Partner outages must not block admin approval of the P2P proof.
    if (!isInvestor && !isBusinessPayer && payer && principalCredit > 0) {
      try {
        await this.creditPayerPartnerDeposit(
          payer,
          principalCredit,
          `P2P deposit via pay — ${withdrawal.referenceId}`,
        );
      } catch {
        /* partner credit is best-effort */
      }
    }

    // 1) Full pay amount credited in INR for investors (USDT converted)
    let updatedPayerWallet = await this.walletService.credit(
      payerWallet._id.toString(),
      principalCredit,
      creditField,
    );

    const rateNote =
      breakdown.exchangeRate != null
        ? ` @ ${breakdown.exchangeRate} INR/USDT`
        : '';

    await this.transactionService.record({
      userId: payment.payerUserId.toString(),
      walletId: payerWallet._id.toString(),
      type: ledgerType,
      amount: principalCredit,
      currency: creditCurrency,
      balanceBefore,
      balanceAfter: updatedPayerWallet.balance,
      referenceType: 'withdrawal_payment',
      referenceId: payment._id.toString(),
      // Never append platform/business fee cuts on payer (user/investor) ledgers.
      description: isInvestor
        ? `Investment via pay — ${withdrawal.referenceId}` +
          (breakdown.payCurrency === Currency.USDT
            ? ` (${payment.amount} USDT → ₹${principalCredit}${rateNote})`
            : '')
        : `P2P payment — ${withdrawal.referenceId}`,
      businessId: payment.businessId?.toString(),
      fromParty: payer ? `${payer.name} (${payer.role})` : undefined,
      toParty: payer ? `${payer.name} wallet` : undefined,
    });

    // 2) Fees: WD fee from owner business; deposit fee from payer business.
    //    Debit business wallet → credit admin, and deduct same from P2P pay limit.
    const feeCommon = {
      currency: Currency.INR,
      fromUserId: payment.payerUserId.toString(),
      fromName: payer?.name || 'Payer',
      fromRole: payer?.role,
      referenceType: 'withdrawal_payment',
      referenceId: payment._id.toString(),
      referenceLabel: payment.referenceId || withdrawal.referenceId,
    };
    if (withdrawalFee > 0 && wdBizId) {
      await this.platformCommissionService.creditCollectedFees({
        ...feeCommon,
        platformAmount: 0,
        businessAmount: withdrawalFee,
        businessId: wdBizId,
      });
      if (withdrawal.origin !== 'business') {
        await this.businessService.consumeP2pPay(wdBizId, withdrawalFee, {
          referenceType: 'withdrawal_payment_fee',
          referenceId: payment._id.toString(),
        });
      }
    }
    if (depositFee > 0 && payerBizId) {
      await this.platformCommissionService.creditCollectedFees({
        ...feeCommon,
        platformAmount: depositFee,
        businessAmount: 0,
        businessId: payerBizId,
      });
      if (!skipP2pPayQuota) {
        await this.businessService.consumeP2pPay(payerBizId, depositFee, {
          referenceType: 'withdrawal_payment_deposit_fee',
          referenceId: payment._id.toString(),
        });
      }
    }

    // 3) Investor bonus on every pay (business INVESTOR_BONUS %) — funded from admin commission wallet.
    let creditedBonus = 0;
    if (investorBonus > 0 && isInvestor) {
      creditedBonus = investorBonus;
      const bonusBefore = updatedPayerWallet.balance;
      updatedPayerWallet = await this.walletService.credit(
        payerWallet._id.toString(),
        creditedBonus,
        creditField,
      );
      const admin = await this.platformCommissionService.findPlatformAdmin();
      const bonusRef = payment.referenceId || withdrawal.referenceId;
      await this.transactionService.record({
        userId: payment.payerUserId.toString(),
        walletId: payerWallet._id.toString(),
        type: LedgerType.COMMISSION,
        direction: LedgerDirection.CREDIT,
        flow: LedgerFlow.INVESTOR_COMMISSION,
        amount: creditedBonus,
        currency: creditCurrency,
        balanceBefore: bonusBefore,
        balanceAfter: updatedPayerWallet.balance,
        referenceType: 'withdrawal_payment_bonus',
        referenceId: payment._id.toString(),
        description: investorCommissionInDescription({
          amount: creditedBonus,
          currency: creditCurrency,
          referenceLabel: bonusRef,
        }),
        businessId: payment.businessId?.toString(),
        counterpartyUserId: admin._id.toString(),
        fromParty: `${admin.name} (admin)`,
        toParty: `${payer?.name || 'Investor'} (investor)`,
      });
      await this.platformCommissionService.debitInvestorCommission({
        amount: creditedBonus,
        currency: creditCurrency,
        toUserId: payment.payerUserId.toString(),
        toName: payer?.name || 'Investor',
        toRole: UserRole.INVESTOR,
        referenceType: 'withdrawal_payment_bonus',
        referenceId: payment._id.toString(),
        referenceLabel: bonusRef,
        businessId: payment.businessId?.toString(),
      });
    }

    // 4) Investor→investor referral rewards from admin (first vs next pay %).
    if (isInvestor && payer && principalCredit > 0) {
      await this.payInvestorReferralRewards({
        payer,
        principalCredit,
        creditCurrency,
        paymentId: payment._id.toString(),
        referenceLabel: payment.referenceId || withdrawal.referenceId,
        businessId: payment.businessId?.toString(),
      });
    }

    payment.commissionAmount = totalCommission;
    payment.bonusAmount = creditedBonus;
    payment.netCreditedAmount = principalCredit + creditedBonus;
    payment.status = TransactionStatus.COMPLETED;
    payment.processedBy = processedBy;
    payment.completedAt = new Date();
    if (notes) payment.notes = notes;
    payment.autoApproveAt = undefined;
    await payment.save();

    // Fees → admin; investor bonus / referral deducted from admin (ledger above).

    withdrawal.reservedAmount = Math.max(
      0,
      (withdrawal.reservedAmount || 0) - payment.amount,
    );
    withdrawal.paidAmount = (withdrawal.paidAmount || 0) + payment.amount;

    // Confirmed slice leaves locked balance immediately (unlock + debit withdrawer).
    // Investor USDT opens lock INR (sourceAmount) while open amount is USDT.
    const settleInInr =
      withdrawal.sourceCurrency === Currency.INR &&
      withdrawal.currency === Currency.USDT &&
      !!withdrawal.exchangeRate;
    const settleCurrency = settleInInr ? Currency.INR : withdrawal.currency;
    const settleAmount = settleInInr
      ? this.exchangeRateService.usdtToInr(payment.amount)
      : payment.amount;

    const withdrawerWallet = await this.walletService.getOrCreate(
      withdrawal.userId.toString(),
      settleCurrency,
      withdrawal.businessId?.toString(),
    );
    // Unlock+debit safely: never throw "Insufficient balance" on receive confirm
    // when lock/conversion differs slightly from settle amount.
    const lockRelease = Math.min(
      withdrawerWallet.lockedBalance || 0,
      settleAmount,
    );
    if (lockRelease > 0) {
      await this.walletService.unlock(withdrawerWallet._id.toString(), lockRelease);
    }
    const refreshedWithdrawer = await this.walletService.findById(
      withdrawerWallet._id.toString(),
    );
    const wdWallet = refreshedWithdrawer || withdrawerWallet;
    const available = Math.max(0, wdWallet.balance - (wdWallet.lockedBalance || 0));
    const debitAmt = Math.min(available, settleAmount);
    const withdrawerBalanceBefore = wdWallet.balance;
    let updatedWithdrawerWallet = wdWallet;
    if (debitAmt > 0) {
      updatedWithdrawerWallet = await this.walletService.debit(
        wdWallet._id.toString(),
        debitAmt,
        'totalWithdrawn',
      );
      await this.transactionService.record({
        userId: withdrawal.userId.toString(),
        walletId: wdWallet._id.toString(),
        type: LedgerType.WITHDRAWAL,
        amount: debitAmt,
        currency: settleCurrency,
        balanceBefore: withdrawerBalanceBefore,
        balanceAfter: updatedWithdrawerWallet.balance,
        referenceType: 'withdrawal_payment',
        referenceId: payment._id.toString(),
        description:
          `Withdrawal payment confirmed — ${payment.referenceId}` +
          (settleInInr
            ? ` (${payment.amount} USDT → ₹${settleAmount})`
            : ''),
        businessId: withdrawal.businessId?.toString(),
      });
    }
    withdrawal.settledFromLock = (withdrawal.settledFromLock || 0) + payment.amount;

    // Older confirms (before per-payment unlock) may still be sitting in lock.
    const lockGap = Math.max(0, withdrawal.paidAmount - (withdrawal.settledFromLock || 0));
    if (lockGap > 0) {
      const gapSettle = settleInInr
        ? this.exchangeRateService.usdtToInr(lockGap)
        : lockGap;
      const latest =
        (await this.walletService.findById(wdWallet._id.toString())) ||
        updatedWithdrawerWallet;
      const gapUnlock = Math.min(latest.lockedBalance || 0, gapSettle);
      if (gapUnlock > 0) {
        await this.walletService.unlock(wdWallet._id.toString(), gapUnlock);
      }
      const afterUnlock =
        (await this.walletService.findById(wdWallet._id.toString())) || latest;
      const gapAvail = Math.max(
        0,
        afterUnlock.balance - (afterUnlock.lockedBalance || 0),
      );
      const gapDebit = Math.min(gapAvail, gapSettle);
      if (gapDebit > 0) {
        const gapBefore = afterUnlock.balance;
        const gapWallet = await this.walletService.debit(
          wdWallet._id.toString(),
          gapDebit,
          'totalWithdrawn',
        );
        await this.transactionService.record({
          userId: withdrawal.userId.toString(),
          walletId: wdWallet._id.toString(),
          type: LedgerType.WITHDRAWAL,
          amount: gapDebit,
          currency: settleCurrency,
          balanceBefore: gapBefore,
          balanceAfter: gapWallet.balance,
          referenceType: 'withdrawal',
          referenceId: withdrawal._id.toString(),
          description: `Withdrawal lock catch-up for previously confirmed payments`,
          businessId: withdrawal.businessId?.toString(),
        });
      }
      withdrawal.settledFromLock = (withdrawal.settledFromLock || 0) + lockGap;
    }

    if (withdrawal.paidAmount >= withdrawal.amount) {
      await this.finalizeWithdrawal(withdrawal, processedBy);
    } else {
      withdrawal.status = TransactionStatus.PROCESSING;
      await withdrawal.save();
    }

    await this.notificationService.send(
      payment.payerUserId.toString(),
      'Payment Approved',
      isInvestor
        ? `Your payment of ₹${payment.amount} was approved. ₹${payment.netCreditedAmount} added to your investment wallet.`
        : `Your payment of ₹${payment.amount} was approved. ₹${payment.netCreditedAmount} credited to wallet.`,
      'success',
      'withdrawal_payment',
      payment._id.toString(),
    );

    if (withdrawal.businessId) {
      await this.webhookService.dispatch(withdrawal.businessId.toString(), 'deposit.approved', {
        type: 'withdrawal_payment',
        paymentReferenceId: payment.referenceId,
        withdrawalReferenceId: withdrawal.referenceId,
        amount: payment.amount,
        netAmount,
        utr: payment.utr,
      });
    }

    await this.auditService.log({
      actorId,
      actorEmail: processedBy,
      action: 'withdrawal_payment.approve',
      resource: 'withdrawal_payment',
      resourceId: payment._id.toString(),
      metadata: {
        amount: payment.amount,
        withdrawalId: withdrawal._id.toString(),
        notes: notes || null,
      },
    });

    this.p2pRealtime.emitListChanged('updated', {
      withdrawalId: withdrawal._id.toString(),
    });

    return payment;
  }

  /** Withdrawer confirms money received → unlocks payer investment (same as approve). */
  async confirmReceived(paymentId: string, userId: string, userEmail: string) {
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Payment is not pending');
    }
    if (payment.disputedAt) {
      throw new BadRequestException('Payment is under dispute');
    }

    const withdrawal = await this.withdrawalModel.findById(payment.withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.userId.toString() !== userId) {
      throw new ForbiddenException('Only the withdrawal owner can confirm received');
    }

    const approved = await this.approvePayment(
      paymentId,
      userEmail || 'user-received',
      userId,
      'Confirmed received by withdrawer',
    );
    return toPayerPaymentPublic(
      (typeof (approved as { toObject?: () => unknown }).toObject === 'function'
        ? (approved as { toObject: () => Record<string, unknown> }).toObject()
        : approved) as Record<string, unknown>,
    );
  }

  /** Raise dispute within 24h of payment submit — creates support ticket, blocks auto-receive. */
  async raiseDispute(
    paymentId: string,
    userId: string,
    userEmail: string,
    dto: DisputeWithdrawalPaymentDto,
  ) {
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        payment.status === TransactionStatus.COMPLETED
          ? 'Payment already confirmed received — cannot dispute'
          : `Only pending payments can be disputed (current: ${payment.status})`,
      );
    }
    if (payment.disputedAt) {
      throw new BadRequestException('Dispute already raised for this payment');
    }

    const withdrawal = await this.withdrawalModel.findById(payment.withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.userId.toString() !== userId) {
      throw new ForbiddenException('Only the withdrawal owner can raise a dispute');
    }

    const windowEnd =
      payment.autoApproveAt ||
      (() => {
        const createdAt = (payment as unknown as { createdAt?: Date }).createdAt;
        return createdAt ? new Date(createdAt.getTime() + VERIFICATION_WINDOW_MS) : null;
      })();

    if (!windowEnd || Date.now() > windowEnd.getTime()) {
      throw new BadRequestException(
        'Dispute window expired (24 hours from payment submit). Payment will auto-receive.',
      );
    }

    const payer = await this.userModel.findById(payment.payerUserId).exec();
    const userReason = dto.reason?.trim() || 'User reported payment not received / mismatch';

    const message = [
      '=== Withdrawal payment dispute ===',
      `Raised by: ${userEmail} (${userId})`,
      `Reason: ${userReason}`,
      '',
      '--- Withdrawal ---',
      `Reference: ${withdrawal.referenceId}`,
      `Withdrawal ID: ${withdrawal._id.toString()}`,
      `Amount: ₹${withdrawal.amount} ${withdrawal.currency}`,
      `Paid so far: ₹${withdrawal.paidAmount || 0}`,
      `Reserved (pending): ₹${withdrawal.reservedAmount || 0}`,
      `Method: ${withdrawal.method}`,
      `Status: ${withdrawal.status}`,
      withdrawal.upiDetails?.upiId ? `UPI: ${withdrawal.upiDetails.upiId}` : null,
      withdrawal.bankDetails?.accountNumber
        ? `Bank: ${withdrawal.bankDetails.accountHolderName || ''} ${withdrawal.bankDetails.accountNumber} IFSC ${withdrawal.bankDetails.ifscCode || ''}`
        : null,
      withdrawal.usdtDetails?.walletAddress
        ? `USDT: ${withdrawal.usdtDetails.walletAddress} (${withdrawal.usdtDetails.network || ''})`
        : null,
      '',
      '--- Payment ---',
      `Payment ref: ${payment.referenceId}`,
      `Payment ID: ${payment._id.toString()}`,
      `Amount: ₹${payment.amount} ${payment.currency}`,
      `UTR: ${payment.utr}`,
      `Proof URL: ${payment.proofImageUrl}`,
      `Proof key: ${payment.proofImageKey}`,
      `Submitted at: ${(payment as unknown as { createdAt?: Date }).createdAt?.toISOString() || 'n/a'}`,
      `Auto-receive at: ${windowEnd.toISOString()}`,
      `Payer user ID: ${payment.payerUserId.toString()}`,
      `Payer: ${payer?.name || 'n/a'} <${payer?.email || 'n/a'}>`,
      '',
      'Note: Auto-receive paused until dispute is resolved by admin.',
    ]
      .filter(Boolean)
      .join('\n');

    const ticket = await this.supportService.create(
      userId,
      {
        subject: `Dispute: payment ${payment.referenceId} on ${withdrawal.referenceId}`,
        message,
        priority: SupportPriority.HIGH,
        category: 'withdrawal_dispute',
      },
      {
        participantIds: [payment.payerUserId.toString()],
        businessId: (payment.businessId || withdrawal.businessId)?.toString(),
        relatedPaymentId: payment._id.toString(),
        relatedWithdrawalId: withdrawal._id.toString(),
      },
    );

    payment.disputedAt = new Date();
    payment.disputeTicketId = ticket.ticketId;
    payment.autoApproveAt = undefined;
    payment.notes = `Dispute raised — ticket ${ticket.ticketId}. ${userReason}`;
    await payment.save();

    // Free withdrawal open slot so new pays can proceed while support resolves.
    // P2P pay-limit was reserved at list-for-P2P — keep it until approve / unlist.
    await this.restoreInvestorPayLimit(payment.payerUserId.toString(), payment);

    withdrawal.reservedAmount = Math.max(
      0,
      (withdrawal.reservedAmount || 0) - payment.amount,
    );
    const hasActivePending = await this.paymentModel.exists({
      withdrawalId: withdrawal._id,
      status: TransactionStatus.PENDING,
      $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
    });
    const hasApproved = (withdrawal.paidAmount || 0) > 0;
    if (!hasActivePending && !hasApproved && withdrawal.status === TransactionStatus.PROCESSING) {
      withdrawal.status = TransactionStatus.PENDING;
    }
    await withdrawal.save();

    await this.notificationService.send(
      payment.payerUserId.toString(),
      'Payment disputed',
      `Withdrawer disputed your payment ${payment.referenceId}. Open Support → ticket ${ticket.ticketId}.`,
      'warning',
      'support_ticket',
      ticket.ticketId,
    );

    const bizId = (payment.businessId || withdrawal.businessId)?.toString();
    if (bizId) {
      try {
        const business = await this.businessService.findDocumentById(bizId);
        await this.notificationService.send(
          business.ownerId.toString(),
          'Withdrawal payment disputed',
          `Dispute on ${payment.referenceId} (${withdrawal.referenceId}). Ticket ${ticket.ticketId}.`,
          'warning',
          'support_ticket',
          ticket.ticketId,
        );
      } catch {
        // business lookup optional
      }
    }

    await this.auditService.log({
      actorId: userId,
      actorEmail: userEmail,
      action: 'withdrawal_payment.dispute',
      resource: 'withdrawal_payment',
      resourceId: payment._id.toString(),
      metadata: {
        ticketId: ticket.ticketId,
        withdrawalId: withdrawal._id.toString(),
        payerUserId: payment.payerUserId.toString(),
        businessId: bizId || null,
        reason: userReason,
      },
    });

    return {
      payment,
      ticket: {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        status: ticket.status,
      },
    };
  }

  async rejectPayment(paymentId: string, dto: RejectWithdrawalPaymentDto, processedBy: string) {
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Payment is not pending');
    }

    const wasDisputed = !!payment.disputedAt;
    payment.status = TransactionStatus.REJECTED;
    payment.rejectionReason = dto.reason;
    payment.processedBy = processedBy;
    await payment.save();

    // Disputed pays already freed reservedAmount in raiseDispute.
    // List-time P2P quota stays until payment approve (release+fees) or unlist.
    if (!wasDisputed) {
      await this.restoreInvestorPayLimit(payment.payerUserId.toString(), payment);
    }

    const withdrawal = await this.withdrawalModel.findById(payment.withdrawalId).exec();
    if (withdrawal) {
      if (!wasDisputed) {
        withdrawal.reservedAmount = Math.max(
          0,
          (withdrawal.reservedAmount || 0) - payment.amount,
        );
      }

      const hasPending = await this.paymentModel.exists({
        withdrawalId: withdrawal._id,
        status: TransactionStatus.PENDING,
        $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
      });
      const hasApproved = (withdrawal.paidAmount || 0) > 0;
      if (!hasPending && !hasApproved && withdrawal.status === TransactionStatus.PROCESSING) {
        withdrawal.status = TransactionStatus.PENDING;
      }
      await withdrawal.save();
    }

    await this.notificationService.send(
      payment.payerUserId.toString(),
      'Payment Rejected',
      `Your payment was rejected: ${dto.reason}`,
      'error',
      'withdrawal_payment',
      payment._id.toString(),
    );

    this.p2pRealtime.emitListChanged('updated', {
      withdrawalId: payment.withdrawalId.toString(),
    });

    return payment;
  }

  private async finalizeWithdrawal(
    withdrawal: WithdrawalDocument,
    processedBy: string,
    session?: import('mongoose').ClientSession,
  ) {
    const wallet = await this.walletService.getOrCreate(
      withdrawal.userId.toString(),
      withdrawal.currency,
    );

    let commissionAmount = 0;
    if (withdrawal.businessId) {
      const commission = await this.commissionService.calculate(
        withdrawal.amount,
        CommissionTarget.BUSINESS,
        withdrawal.businessId.toString(),
        withdrawal.method,
        'withdrawal',
      );
      commissionAmount = commission.amount;
      withdrawal.commissionAmount = commissionAmount;
      await this.businessService.incrementStats(
        withdrawal.businessId.toString(),
        'totalWithdrawals',
        withdrawal.amount,
      );
    }

    // Principal already unlocked+debited per confirmed payment.
    // Business commission is accounting-only on the business — never debit end-user wallet.
    const unsettled = Math.max(0, withdrawal.amount - (withdrawal.settledFromLock || 0));
    if (unsettled > 0) {
      const balBefore = wallet.balance;
      const unlockAmt = Math.min(wallet.lockedBalance || 0, unsettled);
      if (unlockAmt > 0) {
        await this.walletService.unlock(wallet._id.toString(), unlockAmt, session);
      }
      const fresh =
        (await this.walletService.findById(wallet._id.toString(), session || undefined)) ||
        wallet;
      const avail = Math.max(0, fresh.balance - (fresh.lockedBalance || 0));
      const debitAmt = Math.min(avail, unsettled);
      if (debitAmt > 0) {
        const updated = await this.walletService.debit(
          wallet._id.toString(),
          debitAmt,
          'totalWithdrawn',
          session,
        );
        await this.transactionService.record({
          userId: withdrawal.userId.toString(),
          walletId: wallet._id.toString(),
          type: LedgerType.WITHDRAWAL,
          amount: debitAmt,
          currency: withdrawal.currency,
          balanceBefore: balBefore,
          balanceAfter: updated.balance,
          referenceType: 'withdrawal',
          referenceId: withdrawal._id.toString(),
          description: `Withdrawal lock settle — completed by ${processedBy}`,
          businessId: withdrawal.businessId?.toString(),
        });
      }
      withdrawal.settledFromLock = (withdrawal.settledFromLock || 0) + unsettled;
    }

    withdrawal.status = TransactionStatus.COMPLETED;
    withdrawal.processedBy = processedBy;
    withdrawal.completedAt = new Date();
    withdrawal.paidAmount = withdrawal.amount;
    withdrawal.p2pListStatus = 'listed';
    await withdrawal.save(session ? { session } : undefined);

    if (withdrawal.origin === 'business' && withdrawal.businessId) {
      await this.businessService.consumeP2pPay(
        withdrawal.businessId.toString(),
        withdrawal.amount,
        { referenceType: 'withdrawal', referenceId: withdrawal._id.toString() },
      );
    }

    await this.notificationService.send(
      withdrawal.userId.toString(),
      'Withdrawal Completed',
      `Your withdrawal of ₹${withdrawal.amount} is fully paid and completed.`,
      'success',
      'withdrawal',
      withdrawal._id.toString(),
    );

    if (withdrawal.businessId) {
      await this.webhookService.dispatch(withdrawal.businessId.toString(), 'withdrawal.approved', {
        referenceId: withdrawal.referenceId,
        amount: withdrawal.amount,
        paidAmount: withdrawal.paidAmount,
        status: withdrawal.status,
      });
    }
  }

  private async assertNotInvestorToInvestor(
    payerRole: string | undefined,
    ownerUserId: string,
  ) {
    if (payerRole !== UserRole.INVESTOR) return;
    const owner = await this.userModel.findById(ownerUserId).select('role').lean().exec();
    if (isInvestorToInvestorPay(payerRole, owner?.role)) {
      throw new ForbiddenException(
        'Investors cannot pay another investor — deposits and withdrawals are not investor-to-investor',
      );
    }
  }

  private toAvailableView(w: WithdrawalDocument, viewerId?: string) {
    const remaining = this.getRemaining(w);
    const reserved = w.reservedAmount || 0;
    const approved = w.paidAmount || 0;
    const now = Date.now();
    const assignedToMe = viewerId ? isAssignedToPayer(w.assignedTo, viewerId) : false;
    const claimActive =
      !assignedToMe &&
      !!w.claimLockedBy &&
      !!w.claimLockedUntil &&
      w.claimLockedUntil.getTime() > now;

    return {
      _id: w._id,
      referenceId: w.referenceId,
      amount: w.amount,
      /** Confirmed / received (no longer locked). */
      paidAmount: approved,
      approvedAmount: approved,
      /** Pending verify — only this counts as Locked. */
      reservedAmount: reserved,
      remainingAmount: remaining,
      currency: w.currency,
      method: w.method,
      status: w.status,
      businessId: w.businessId?.toString(),
      upiDetails: w.upiDetails,
      bankDetails: w.bankDetails,
      usdtDetails: w.usdtDetails,
      createdAt: (w as unknown as { createdAt: Date }).createdAt,
      claimLockedBy: claimActive ? w.claimLockedBy?.toString() : null,
      claimLockedUntil: claimActive ? w.claimLockedUntil : null,
      claimPayDeadline: claimActive ? w.claimPayDeadline ?? null : null,
      origin: w.origin,
      assignedToMe,
      priority: !!w.priority,
    };
  }

  /**
   * Investor→investor referral: admin pays referrer/joiner % of principal
   * (first completed P2P pay vs subsequent), using platform settings.
   */
  private async payInvestorReferralRewards(opts: {
    payer: UserDocument;
    principalCredit: number;
    creditCurrency: Currency;
    paymentId: string;
    referenceLabel: string;
    businessId?: string;
  }) {
    const referrerId = opts.payer.referredByInvestor?.toString();
    if (!referrerId) return;
    if (referrerId === opts.payer._id.toString()) return;

    const referrer = await this.userModel.findById(referrerId).exec();
    if (!referrer || referrer.role !== UserRole.INVESTOR) return;

    const priorCompleted = await this.paymentModel.countDocuments({
      status: TransactionStatus.COMPLETED,
      _id: { $ne: new Types.ObjectId(opts.paymentId) },
      $or: [
        { payerUserId: opts.payer._id },
        { payerUserId: opts.payer._id.toString() },
      ],
    });

    const settings = await this.platformSettingsService.get();
    const { referrerPercent, joinerPercent } = referralPercentsForPay({
      priorCompletedPays: priorCompleted,
      firstReferrerPercent: settings.investorReferralFirstReferrerPercent ?? 2,
      firstJoinerPercent: settings.investorReferralFirstJoinerPercent ?? 1,
      nextReferrerPercent: settings.investorReferralNextReferrerPercent ?? 1,
      nextJoinerPercent: settings.investorReferralNextJoinerPercent ?? 0,
    });

    const referrerAmt = referralRewardAmount(opts.principalCredit, referrerPercent);
    const joinerAmt = referralRewardAmount(opts.principalCredit, joinerPercent);

    if (referrerAmt > 0) {
      await this.platformCommissionService.settleReferralReward({
        amount: referrerAmt,
        currency: opts.creditCurrency,
        toUserId: referrer._id.toString(),
        toName: referrer.name || 'Investor',
        referralRole: 'referrer',
        referenceType: 'withdrawal_payment_referral',
        referenceId: opts.paymentId,
        referenceLabel: opts.referenceLabel,
        businessId: opts.businessId,
      });
    }
    if (joinerAmt > 0) {
      await this.platformCommissionService.settleReferralReward({
        amount: joinerAmt,
        currency: opts.creditCurrency,
        toUserId: opts.payer._id.toString(),
        toName: opts.payer.name || 'Investor',
        referralRole: 'joiner',
        referenceType: 'withdrawal_payment_referral',
        referenceId: opts.paymentId,
        referenceLabel: opts.referenceLabel,
        businessId: opts.businessId,
      });
    }
  }

  /**
   * Completed + pending (non-disputed) pay amounts toward investor plan progress.
   * Always aggregates INR so USDT pays don't mix currencies with INR plan targets.
   * Pass `excludePaymentId` when evaluating the payment being approved (still PENDING).
   */
  private async getPaidTowardPlan(
    payerUserId: string,
    excludePaymentId?: string,
  ): Promise<number> {
    const and: Record<string, unknown>[] = [
      {
        $or: [
          { payerUserId: new Types.ObjectId(payerUserId) },
          { payerUserId: payerUserId },
        ],
      },
      {
        status: {
          $in: [TransactionStatus.PENDING, TransactionStatus.COMPLETED],
        },
      },
      {
        $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
      },
    ];
    if (excludePaymentId) {
      and.push({
        _id: { $ne: new Types.ObjectId(excludePaymentId) },
      });
    }

    const usdtInrRate = this.exchangeRateService.getUsdtInrRate();
    const rows = await this.paymentModel.aggregate<{ total: number }>([
      { $match: { $and: and } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [
                {
                  $gt: [
                    { $ifNull: ['$netCreditedAmount', 0] },
                    0,
                  ],
                },
                // Completed credits are already INR (principal; bonus excluded via separate field).
                {
                  $subtract: [
                    { $ifNull: ['$netCreditedAmount', 0] },
                    { $ifNull: ['$bonusAmount', 0] },
                  ],
                },
                // Pending / incomplete: convert USDT amount → INR when needed.
                {
                  $cond: [
                    { $eq: [{ $toUpper: { $ifNull: ['$currency', 'INR'] } }, 'USDT'] },
                    { $multiply: ['$amount', usdtInrRate] },
                    '$amount',
                  ],
                },
              ],
            },
          },
        },
      },
    ]);
    return Math.round((rows[0]?.total || 0) * 100) / 100;
  }

  private async setClaimRedis(withdrawalId: string, userId: string, ttlSeconds: number) {
    await this.redis.set(`${CLAIM_REDIS_PREFIX}${withdrawalId}`, { userId }, ttlSeconds);
  }

  private async clearClaimRedis(withdrawalId: string) {
    await this.redis.del(`${CLAIM_REDIS_PREFIX}${withdrawalId}`);
  }

  /** Pending investor payments count as locked points until approved / auto-unlocked. */
  async getPendingLockedAmount(payerUserId: string) {
    const rows = await this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          status: TransactionStatus.PENDING,
          $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
          $and: [
            {
              $or: [
                { payerUserId: new Types.ObjectId(payerUserId) },
                { payerUserId: payerUserId },
              ],
            },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return rows[0]?.total || 0;
  }

  /** Auto-approve payments whose verification window (24h) has elapsed. */
  async autoApproveDuePayments() {
    const now = new Date();

    // Backfill missing autoApproveAt for older pending rows (createdAt + 24h)
    const missingAutoApprove = await this.paymentModel
      .find({
        status: TransactionStatus.PENDING,
        disputedAt: { $exists: false },
        autoApproveAt: { $exists: false },
      })
      .limit(100)
      .exec();

    for (const payment of missingAutoApprove) {
      const createdAt = (payment as unknown as { createdAt?: Date }).createdAt;
      if (!createdAt) continue;
      payment.autoApproveAt = new Date(createdAt.getTime() + VERIFICATION_WINDOW_MS);
      await payment.save();
    }

    const due = await this.paymentModel
      .find({
        status: TransactionStatus.PENDING,
        disputedAt: { $exists: false },
        autoApproveAt: { $lte: now },
      })
      .limit(50)
      .exec();

    const results: string[] = [];
    for (const payment of due) {
      try {
        await this.approvePayment(
          payment._id.toString(),
          'system-auto-24h',
          undefined,
          'Auto-received after 24h verification window without user confirmation',
        );
        results.push(payment._id.toString());
      } catch {
        // skip failures; retry next tick
      }
    }
    return results;
  }

  /** INR amount held against business p2pPayUsed for this payment. */
  private paymentLimitInr(payment: {
    amount: number;
    currency?: string;
  }): number {
    const payIsUsdt = (payment.currency || '').toUpperCase() === Currency.USDT;
    const inr = payIsUsdt
      ? this.exchangeRateService.usdtToInr(payment.amount)
      : payment.amount;
    return Math.round(inr * 100) / 100;
  }

  private capMaxPayableByInvestorLimit(
    maxPayable: number,
    remainingInr: number,
    payCurrency: string,
    method?: string,
  ) {
    const rounded = Math.round(Math.max(0, remainingInr) * 100) / 100;
    if (rounded <= 0 || maxPayable <= 0) return 0;
    const payIsUsdt =
      (payCurrency || '').toUpperCase() === Currency.USDT ||
      method === PaymentMethod.USDT;
    const cap = payIsUsdt
      ? this.exchangeRateService.inrBudgetToUsdt(rounded)
      : rounded;
    return Math.min(maxPayable, Math.round(cap * 100) / 100);
  }

  private async restoreInvestorPayLimit(
    payerUserId: string,
    payment: { amount: number; currency?: string },
  ) {
    const payer = await this.userModel.findById(payerUserId).select('role').lean().exec();
    if (payer?.role !== UserRole.INVESTOR) return;
    await this.usersService.restoreInvestorLimit(payerUserId, this.paymentLimitInr(payment));
  }

  private maskUtr(utr: string) {
    if (utr.length <= 4) return '****';
    return `${'*'.repeat(utr.length - 4)}${utr.slice(-4)}`;
  }

  async hasActivePayments(withdrawalId: string) {
    return this.paymentModel.exists({
      withdrawalId: new Types.ObjectId(withdrawalId),
      status: { $in: [TransactionStatus.PENDING, TransactionStatus.COMPLETED] },
    });
  }
}
