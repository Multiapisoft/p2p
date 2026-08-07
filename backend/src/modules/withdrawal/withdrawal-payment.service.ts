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
import { CommissionService } from '../commission/commission.service';
import { TransactionService } from '../transaction/transaction.service';
import { BusinessService } from '../business/business.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { WebhookService } from '../webhook/webhook.service';
import { AuditService } from '../audit/audit.service';
import { SupportService } from '../support/support.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UserRole } from '../../common/enums/role.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { LedgerType, Currency } from '../../common/enums/currency.enum';
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
import { RedisService } from '../../redis/redis.service';

const VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLAIM_REDIS_PREFIX = 'withdrawal-claim:';

export type WithdrawalPaymentListOpts = ListQueryOpts & { method?: string };

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
    private redis: RedisService,
  ) {}

  getRemaining(withdrawal: WithdrawalDocument) {
    const locked =
      (withdrawal.paidAmount || 0) + (withdrawal.reservedAmount || 0);
    return Math.max(0, withdrawal.amount - locked);
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
    let businessId = payer.referredByBusiness?.toString();
    let withdrawalRemaining: number | null = null;
    if (withdrawalId) {
      const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      method = withdrawal.method;
      payCurrency = (withdrawal.currency as Currency) || Currency.INR;
      if (withdrawal.businessId) {
        businessId = withdrawal.businessId.toString();
      }
      withdrawalRemaining = this.getRemaining(withdrawal);
      if (amount > withdrawalRemaining) {
        throw new BadRequestException(
          `Amount exceeds remaining ${withdrawalRemaining}`,
        );
      }
    }

    const isInvestor = payer.role === UserRole.INVESTOR;
    const { maxPayable, p2pPayRemainingInr } =
      await this.businessService.getMaxPayableAmount(
        businessId,
        withdrawalRemaining ?? amount,
        payCurrency,
        method,
        (inr) => this.exchangeRateService.inrBudgetToUsdt(inr),
      );

    if (amount > maxPayable) {
      throw new BadRequestException(
        p2pPayRemainingInr != null
          ? `Amount exceeds business P2P pay limit. Max payable ${maxPayable} (limit remaining ₹${p2pPayRemainingInr})`
          : `Amount exceeds max payable ${maxPayable}`,
      );
    }

    const breakdown = await this.computeCreditBreakdown(
      amount,
      businessId,
      method,
      isInvestor,
      payCurrency,
    );
    return {
      ...breakdown,
      maxPayable,
      p2pPayRemainingInr,
      withdrawalRemaining,
    };
  }

  private async computeCreditBreakdown(
    amount: number,
    businessId: string | undefined,
    method: PaymentMethod | undefined,
    isInvestor: boolean,
    payCurrency: string = Currency.INR,
  ) {
    let businessCommission = 0;
    let platformCommission = 0;
    let investorBonus = 0;

    if (businessId) {
      const take = await this.commissionService.calculate(
        amount,
        CommissionTarget.BUSINESS,
        businessId,
        method,
      );
      businessCommission = take.amount;
    }

    const platformFee = await this.commissionService.calculate(
      amount,
      CommissionTarget.PLATFORM,
      undefined,
      method,
    );
    platformCommission = platformFee.amount;

    // Fee is tracked for business/admin only — NEVER deducted from payer/investor wallet.
    let commissionAmount = Math.round((businessCommission + platformCommission) * 100) / 100;
    let principalCredit = Math.round(amount * 100) / 100;

    if (isInvestor && businessId) {
      const bonus = await this.commissionService.calculate(
        amount,
        CommissionTarget.INVESTOR_BONUS,
        businessId,
        method,
      );
      investorBonus = bonus.amount;
    }

    const payIsUsdt =
      (payCurrency || '').toUpperCase() === Currency.USDT || method === PaymentMethod.USDT;
    // Investor points / wallet credit are always INR.
    let creditCurrency: Currency = Currency.INR;
    let exchangeRate: number | null = null;
    let payAmountInr = principalCredit;
    let bonusInPayCurrency = investorBonus;

    if (isInvestor && payIsUsdt) {
      exchangeRate = this.exchangeRateService.getUsdtInrRate();
      principalCredit = this.exchangeRateService.usdtToInr(amount);
      investorBonus = this.exchangeRateService.usdtToInr(bonusInPayCurrency);
      commissionAmount = this.exchangeRateService.usdtToInr(commissionAmount);
      businessCommission = this.exchangeRateService.usdtToInr(businessCommission);
      platformCommission = this.exchangeRateService.usdtToInr(platformCommission);
      payAmountInr = principalCredit;
      creditCurrency = Currency.INR;
    } else if (!isInvestor && payIsUsdt) {
      creditCurrency = Currency.USDT;
    }

    const netCredited = Math.round((principalCredit + investorBonus) * 100) / 100;

    return {
      payAmount: amount,
      payCurrency: payIsUsdt ? Currency.USDT : Currency.INR,
      payAmountInr,
      commissionAmount,
      businessCommission,
      platformCommission,
      principalCredit: Math.max(0, principalCredit),
      bonusAmount: Math.max(0, Math.round(investorBonus * 100) / 100),
      bonusInPayCurrency: Math.max(0, Math.round(bonusInPayCurrency * 100) / 100),
      netCredited: Math.max(0, netCredited),
      creditCurrency,
      exchangeRate,
      isInvestor,
      businessId: businessId || null,
    };
  }

  async findAvailableForPayment(userId: string, opts: WithdrawalPaymentListOpts = {}) {
    const { page, limit, skip, search, sort } = normalizeListOpts(opts);
    const payer = await this.userModel.findById(userId).exec();
    if (!payer) throw new NotFoundException('User not found');

    const settings = await this.platformSettingsService.get();
    const isInvestor = payer.role === UserRole.INVESTOR;
    const planAmount = payer.investorPlanAmount || null;
    const multiplier = settings.investorPlanTargetMultiplier ?? 1.1;
    const targetAmount = planAmount != null ? Math.round(planAmount * multiplier * 100) / 100 : null;

    if (isInvestor && !planAmount) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        needsPlan: true,
        planAmounts: settings.investorPlanAmounts ?? [25000, 50000, 100000, 200000],
        planAmount: null,
        targetAmount: null,
        paidTowardPlan: 0,
        claimLockMinutes: settings.investorClaimLockMinutes,
        paySubmitMinutes: settings.investorPaySubmitMinutes,
      };
    }

    const paidTowardPlan = isInvestor ? await this.getPaidTowardPlan(userId) : null;

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
        $expr: {
          $lt: [
            {
              $add: [
                { $ifNull: ['$paidAmount', 0] },
                { $ifNull: ['$reservedAmount', 0] },
              ],
            },
            '$amount',
          ],
        },
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
        ],
      },
    ];

    if (exhaustedBusinessIds.length > 0) {
      and.push({
        $or: [
          { businessId: { $exists: false } },
          { businessId: null },
          { businessId: { $nin: exhaustedBusinessIds } },
        ],
      });
    }

    if (opts.method && opts.method !== 'all') {
      and.push({ method: opts.method as PaymentMethod });
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

    const filter = { $and: and };
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.withdrawalModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.withdrawalModel.countDocuments(filter).exec(),
    ]);

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

    const payerBusinessId = payer.referredByBusiness?.toString();

    const itemsWithCredit = await Promise.all(
      items.map(async (w) => {
        const view = this.toAvailableView(w);
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
        const { maxPayable, p2pPayRemainingInr } =
          await this.businessService.getMaxPayableAmount(
            businessId,
            remaining,
            w.currency,
            w.method,
            (inr) => this.exchangeRateService.inrBudgetToUsdt(inr),
          );

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
          w.method,
          !!isInvestor,
          w.currency,
        );
        return {
          ...view,
          maxPayable,
          p2pPayRemainingInr,
          creditIfPayFull: {
            payAmount: credit.payAmount,
            payCurrency: credit.payCurrency,
            payAmountInr: credit.payAmountInr,
            commissionAmount: credit.commissionAmount,
            bonusAmount: credit.bonusAmount,
            netCredited: credit.netCredited,
            principalCredit: credit.principalCredit,
            creditCurrency: credit.creditCurrency,
            exchangeRate: credit.exchangeRate,
          },
        };
      }),
    );

    return {
      items: itemsWithCredit,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      needsPlan: false,
      planAmounts: settings.investorPlanAmounts ?? [25000, 50000, 100000, 200000],
      planAmount,
      targetAmount,
      paidTowardPlan,
      claimLockMinutes: settings.investorClaimLockMinutes,
      paySubmitMinutes: settings.investorPaySubmitMinutes,
    };
  }

  /**
   * Claim a listed withdrawal for exclusive pay window (USER / INVESTOR payers).
   * Refreshes deadlines if already claimed by self.
   */
  async claimWithdrawal(userId: string, withdrawalId: string) {
    const payer = await this.userModel.findById(userId).exec();
    if (!payer) throw new NotFoundException('User not found');
    if (payer.role !== UserRole.USER && payer.role !== UserRole.INVESTOR) {
      throw new ForbiddenException('Only users and investors can claim withdrawals for payment');
    }

    if (payer.role === UserRole.INVESTOR && !payer.investorPlanAmount) {
      throw new BadRequestException('Select an investor plan before claiming withdrawals');
    }

    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    if (withdrawal.userId.toString() === userId) {
      throw new BadRequestException('Cannot claim your own withdrawal');
    }

    if (
      withdrawal.status !== TransactionStatus.PENDING &&
      withdrawal.status !== TransactionStatus.PROCESSING
    ) {
      throw new BadRequestException('Withdrawal is not open for payments');
    }

    if (withdrawal.p2pListStatus !== 'listed') {
      throw new BadRequestException(
        'Withdrawal is waiting for business/admin approval before it can be paid',
      );
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

    withdrawal.claimLockedBy = new Types.ObjectId(userId);
    withdrawal.claimLockedUntil = claimLockedUntil;
    withdrawal.claimPayDeadline = claimPayDeadline;
    await withdrawal.save();

    await this.setClaimRedis(withdrawalId, userId, Math.ceil(claimLockMs / 1000));

    return {
      ...this.toAvailableView(withdrawal),
      claimLockedBy: userId,
      claimLockedUntil,
      claimPayDeadline,
      claimLockMs,
      paySubmitMs,
    };
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

    return {
      ...withdrawal.toObject(),
      remainingAmount: remaining,
      payments: payments.map((p) => ({
        ...p.toObject(),
        utr: isOwner || p.payerUserId.toString() === userId ? p.utr : this.maskUtr(p.utr),
      })),
    };
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

    if (withdrawal.p2pListStatus !== 'listed') {
      throw new BadRequestException(
        'Withdrawal is waiting for business/admin approval before it can be paid',
      );
    }

    const now = new Date();
    const claimActive =
      !!withdrawal.claimLockedBy &&
      !!withdrawal.claimLockedUntil &&
      withdrawal.claimLockedUntil.getTime() > now.getTime();

    if (claimActive && withdrawal.claimLockedBy!.toString() !== payerUserId) {
      throw new BadRequestException(
        'This withdrawal is temporarily claimed by another payer. Try again later.',
      );
    }

    if (
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
    if (!claimActive) {
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
    const refErr = paymentRefErrorForMethod(refRaw, withdrawal.method);
    if (refErr) throw new BadRequestException(refErr);
    const utrNorm = isUsdtPayout
      ? String(normalizeTxHash(refRaw))
      : String(normalizeUtr(refRaw));
    const utrAlreadyUsed = await this.paymentModel.exists({
      utr: { $regex: `^${this.escapeRegex(utrNorm)}$`, $options: 'i' },
      status: {
        $in: [
          TransactionStatus.PENDING,
          TransactionStatus.PROCESSING,
          TransactionStatus.COMPLETED,
        ],
      },
    });
    if (utrAlreadyUsed) {
      throw new BadRequestException(
        isUsdtPayout
          ? 'This USDT / TRX TxID is already submitted. Please use a different transaction hash.'
          : 'This UTR is already submitted. Please use a different valid UTR.',
      );
    }

    this.storageService.validateProofKey(dto.proofImageKey, payerUserId);

    const payer = await this.userModel.findById(payerUserId).exec();
    // Prefer withdrawal's business (P2P flow) so admin "Set Commission" on that business applies
    const businessId =
      withdrawal.businessId?.toString() || payer?.referredByBusiness?.toString();
    const isInvestor = payer?.role === UserRole.INVESTOR;

    if (isInvestor && !payer?.investorPlanAmount) {
      throw new BadRequestException('Select an investor plan before submitting payments');
    }

    const { maxPayable, p2pPayRemainingInr } =
      await this.businessService.getMaxPayableAmount(
        businessId,
        remaining,
        withdrawal.currency,
        withdrawal.method,
        (inr) => this.exchangeRateService.inrBudgetToUsdt(inr),
      );
    if (dto.amount > maxPayable) {
      throw new BadRequestException(
        p2pPayRemainingInr != null
          ? `Amount exceeds business P2P pay limit. Max payable ${maxPayable} (limit remaining ₹${p2pPayRemainingInr})`
          : `Amount exceeds max payable ${maxPayable}`,
      );
    }

    const estimate = await this.computeCreditBreakdown(
      dto.amount,
      businessId,
      withdrawal.method,
      !!isInvestor,
      withdrawal.currency,
    );

    // Business P2P limit is INR — convert USDT pays to INR for limit accounting
    const limitConsumeAmount = Math.round(estimate.payAmountInr * 100) / 100;

    if (businessId) {
      await this.businessService.reserveP2pPay(businessId, limitConsumeAmount);
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
        amount: dto.amount,
        currency: withdrawal.currency,
        utr: dto.utr.trim(),
        proofImageKey: dto.proofImageKey,
        proofImageUrl: dto.proofImageUrl,
        status: TransactionStatus.PENDING,
        autoApproveAt,
        estimatedCommissionAmount: estimate.commissionAmount,
        estimatedBonusAmount: estimate.bonusAmount,
        estimatedNetCredited: estimate.netCredited,
      });
    } catch (err) {
      if (businessId) {
        await this.businessService.releaseP2pPay(businessId, limitConsumeAmount);
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

    await this.notificationService.send(
      withdrawal.userId.toString(),
      'Partial Payment Received',
      `Someone submitted ₹${dto.amount} toward your withdrawal ${withdrawal.referenceId}`,
      'info',
      'withdrawal',
      withdrawal._id.toString(),
    );

    return payment;
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
      this.paymentModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
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
        .populate('withdrawalId')
        .populate('payerUserId', 'name email')
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
    const creditField = isInvestor ? 'totalInvested' : 'totalDeposited';
    const ledgerType = isInvestor ? LedgerType.INVESTMENT : LedgerType.DEPOSIT;

    const breakdown = await this.computeCreditBreakdown(
      payment.amount,
      payment.businessId?.toString(),
      withdrawal.method,
      !!isInvestor,
      payment.currency || withdrawal.currency,
    );

    const businessCommission = breakdown.businessCommission;
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
    if (payment.disputedAt && payment.businessId) {
      await this.businessService.reserveP2pPay(
        payment.businessId.toString(),
        this.paymentLimitInr(payment),
      );
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

    // Regular users (not investors): mirror deposit onto partner site wallet when configured.
    // Partner outages must not block admin approval of the P2P proof.
    if (!isInvestor && payer && principalCredit > 0) {
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
      description: isInvestor
        ? `Investment via pay — ${withdrawal.referenceId}` +
          (breakdown.payCurrency === Currency.USDT
            ? ` (${payment.amount} USDT → ₹${principalCredit}${rateNote})`
            : '')
        : `P2P payment — ${withdrawal.referenceId}`,
      businessId: payment.businessId?.toString(),
    });

    // 2) Investor bonus as separate credit + ledger (INR)
    if (investorBonus > 0) {
      const bonusBefore = updatedPayerWallet.balance;
      updatedPayerWallet = await this.walletService.credit(
        payerWallet._id.toString(),
        investorBonus,
        creditField,
      );
      await this.transactionService.record({
        userId: payment.payerUserId.toString(),
        walletId: payerWallet._id.toString(),
        type: ledgerType,
        amount: investorBonus,
        currency: creditCurrency,
        balanceBefore: bonusBefore,
        balanceAfter: updatedPayerWallet.balance,
        referenceType: 'withdrawal_payment_bonus',
        referenceId: payment._id.toString(),
        description: `Investor bonus (+₹${investorBonus}) on ${withdrawal.referenceId}${rateNote}`,
        businessId: payment.businessId?.toString(),
      });
    }

    payment.commissionAmount = totalCommission;
    payment.bonusAmount = investorBonus;
    payment.netCreditedAmount = netAmount;
    payment.status = TransactionStatus.COMPLETED;
    payment.processedBy = processedBy;
    payment.completedAt = new Date();
    if (notes) payment.notes = notes;
    payment.autoApproveAt = undefined;
    await payment.save();

    // Business fee is accounting-only (not deducted from investor). Record for audit.
    if (totalCommission > 0) {
      await this.transactionService.record({
        userId: payment.payerUserId.toString(),
        walletId: payerWallet._id.toString(),
        type: LedgerType.COMMISSION,
        amount: totalCommission,
        currency: creditCurrency,
        balanceBefore: updatedPayerWallet.balance,
        balanceAfter: updatedPayerWallet.balance,
        referenceType: 'withdrawal_payment',
        referenceId: payment._id.toString(),
        description: `Business/platform fee on P2P pay (from business limit, not investor wallet)`,
        businessId: payment.businessId?.toString(),
      });
    }

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
    const withdrawerBalanceBefore = withdrawerWallet.balance;
    await this.walletService.unlock(withdrawerWallet._id.toString(), settleAmount);
    const updatedWithdrawerWallet = await this.walletService.debit(
      withdrawerWallet._id.toString(),
      settleAmount,
      'totalWithdrawn',
    );
    await this.transactionService.record({
      userId: withdrawal.userId.toString(),
      walletId: withdrawerWallet._id.toString(),
      type: LedgerType.WITHDRAWAL,
      amount: settleAmount,
      currency: settleCurrency,
      balanceBefore: withdrawerBalanceBefore,
      balanceAfter: updatedWithdrawerWallet.balance,
      referenceType: 'withdrawal_payment',
      referenceId: payment._id.toString(),
      description: `Withdrawal payment confirmed — ${payment.referenceId}` +
        (settleInInr
          ? ` (${payment.amount} USDT → ₹${settleAmount})`
          : ''),
      businessId: withdrawal.businessId?.toString(),
    });
    withdrawal.settledFromLock = (withdrawal.settledFromLock || 0) + payment.amount;

    // Older confirms (before per-payment unlock) may still be sitting in lock.
    const lockGap = Math.max(0, withdrawal.paidAmount - (withdrawal.settledFromLock || 0));
    if (lockGap > 0) {
      const gapSettle = settleInInr
        ? this.exchangeRateService.usdtToInr(lockGap)
        : lockGap;
      const gapBefore = updatedWithdrawerWallet.balance;
      await this.walletService.unlock(withdrawerWallet._id.toString(), gapSettle);
      const gapWallet = await this.walletService.debit(
        withdrawerWallet._id.toString(),
        gapSettle,
        'totalWithdrawn',
      );
      withdrawal.settledFromLock = (withdrawal.settledFromLock || 0) + lockGap;
      await this.transactionService.record({
        userId: withdrawal.userId.toString(),
        walletId: withdrawerWallet._id.toString(),
        type: LedgerType.WITHDRAWAL,
        amount: gapSettle,
        currency: settleCurrency,
        balanceBefore: gapBefore,
        balanceAfter: gapWallet.balance,
        referenceType: 'withdrawal',
        referenceId: withdrawal._id.toString(),
        description: `Withdrawal lock catch-up for previously confirmed payments`,
        businessId: withdrawal.businessId?.toString(),
      });
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
        ? `Your payment of ₹${payment.amount} was approved. ₹${netAmount} added to your investment wallet.`
        : `Your payment of ₹${payment.amount} was approved. ₹${netAmount} credited to wallet.`,
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

    return this.approvePayment(
      paymentId,
      userEmail || 'user-received',
      userId,
      'Confirmed received by withdrawer — investment unlocked from pending lock',
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
      '--- Split payment ---',
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

    // Free withdrawal open slot AND business P2P quota so new pays can proceed
    // while support resolves the dispute. Re-reserve on approve; skip on reject.
    if (payment.businessId) {
      await this.businessService.releaseP2pPay(
        payment.businessId.toString(),
        this.paymentLimitInr(payment),
      );
    }

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

    // Disputed pays already released P2P quota + reservedAmount in raiseDispute
    if (payment.businessId && !wasDisputed) {
      await this.businessService.releaseP2pPay(
        payment.businessId.toString(),
        this.paymentLimitInr(payment),
      );
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
      );
      commissionAmount = commission.amount;
      withdrawal.commissionAmount = commissionAmount;
      await this.businessService.incrementStats(
        withdrawal.businessId.toString(),
        'totalWithdrawals',
        withdrawal.amount,
      );
    }

    // Principal already unlocked+debited per confirmed payment — only settle fee here.
    // Gap settle covers older rows where paidAmount grew before per-payment unlock existed.
    const unsettled = Math.max(0, withdrawal.amount - (withdrawal.settledFromLock || 0));
    if (unsettled > 0) {
      const balBefore = wallet.balance;
      await this.walletService.unlock(wallet._id.toString(), unsettled, session);
      const updated = await this.walletService.debit(
        wallet._id.toString(),
        unsettled,
        'totalWithdrawn',
        session,
      );
      withdrawal.settledFromLock = (withdrawal.settledFromLock || 0) + unsettled;
      await this.transactionService.record({
        userId: withdrawal.userId.toString(),
        walletId: wallet._id.toString(),
        type: LedgerType.WITHDRAWAL,
        amount: unsettled,
        currency: withdrawal.currency,
        balanceBefore: balBefore,
        balanceAfter: updated.balance,
        referenceType: 'withdrawal',
        referenceId: withdrawal._id.toString(),
        description: `Withdrawal lock settle — completed by ${processedBy}`,
        businessId: withdrawal.businessId?.toString(),
      });
    }

    if (commissionAmount > 0) {
      const freshWallet = await this.walletService.getOrCreate(
        withdrawal.userId.toString(),
        withdrawal.currency,
      );
      const balanceBefore = freshWallet.balance;
      const updatedWallet = await this.walletService.debit(
        freshWallet._id.toString(),
        commissionAmount,
        'totalWithdrawn',
        session,
      );
      await this.transactionService.record({
        userId: withdrawal.userId.toString(),
        walletId: freshWallet._id.toString(),
        type: LedgerType.COMMISSION,
        amount: commissionAmount,
        currency: withdrawal.currency,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        referenceType: 'withdrawal',
        referenceId: withdrawal._id.toString(),
        description: `Withdrawal commission — completed by ${processedBy}`,
        businessId: withdrawal.businessId?.toString(),
      });
    }

    withdrawal.status = TransactionStatus.COMPLETED;
    withdrawal.processedBy = processedBy;
    withdrawal.completedAt = new Date();
    withdrawal.paidAmount = withdrawal.amount;
    await withdrawal.save(session ? { session } : undefined);

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

  private toAvailableView(w: WithdrawalDocument) {
    const remaining = this.getRemaining(w);
    const reserved = w.reservedAmount || 0;
    const approved = w.paidAmount || 0;
    const now = Date.now();
    const claimActive =
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
    };
  }

  /** Completed + pending (non-disputed) pay amounts toward investor plan progress. */
  private async getPaidTowardPlan(payerUserId: string): Promise<number> {
    const rows = await this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          $and: [
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
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
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

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
