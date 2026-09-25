import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Withdrawal, WithdrawalDocument } from './schemas/withdrawal.schema';
import {
  CreateWithdrawalDto,
  ProcessWithdrawalDto,
  RejectWithdrawalDto,
  UpdateWithdrawalDestinationDto,
} from './dto/withdrawal.dto';
import { WalletService } from '../wallet/wallet.service';
import { CommissionService } from '../commission/commission.service';
import { TransactionService } from '../transaction/transaction.service';
import { BusinessService } from '../business/business.service';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { LedgerType, LedgerDirection, Currency, UserStatus } from '../../common/enums/currency.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UserRole } from '../../common/enums/role.enum';
import { NotificationService } from '../notification/notification.service';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { IntegrationRedirectService } from '../integration/integration-redirect.service';
import { BusinessFloatService } from '../integration/business-float.service';
import { PartnerApiService } from '../integration/partner-api.service';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';
import { ExchangeRateService } from '../wallet/exchange-rate.service';
import {
  WithdrawalPayment,
  WithdrawalPaymentDocument,
} from './schemas/withdrawal-payment.schema';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { withOptionalTransaction } from '../../common/utils/mongo-transaction';
import { assertValidWithdrawalDestination } from './utils/withdrawal-destination.validation';
import {
  adminWithdrawalVisibilityFilter,
  businessWithdrawalVisibilityFilter,
  isInvestorToInvestorPay,
  remainingTatSeconds,
  tatCutoffDate,
  userCanCancelWithdrawal,
} from './utils/withdrawal-visibility.util';
import { assertUniquePaymentRef, escapeRegex } from './utils/payment-ref-uniqueness.util';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { PlatformCommissionService } from '../wallet/platform-commission.service';
import { platformCommissionWithdrawError } from './utils/platform-commission-withdraw.util';
import { P2pRealtimeService } from '../realtime/p2p-realtime.service';
import {
  listApprovalHeadroomError,
  listApprovalHeadroomNeeded,
} from './utils/list-approval-fee-headroom.util';
import { roundMoney } from './utils/p2p-settlement-math.util';
import { shouldHealCancelledListedQuota } from '../business/utils/p2p-pay-quota.util';
import { businessScopeFilter, assertActorBusinessAccess } from '../../common/utils/admin-business-scope.util';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

export type WithdrawalListOpts = ListQueryOpts & {
  method?: string;
  /** `user` = non-business origins; `business` = business-origin only. */
  origin?: string;
};

const ADMIN_USER_FIELDS =
  'name email phone role status businessUserCode externalRef';

@Injectable()
export class WithdrawalService {
  constructor(
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    @InjectModel(WithdrawalPayment.name)
    private paymentModel: Model<WithdrawalPaymentDocument>,
    @InjectConnection() private connection: Connection,
    private walletService: WalletService,
    private commissionService: CommissionService,
    private transactionService: TransactionService,
    private businessService: BusinessService,
    private integrationRedirectService: IntegrationRedirectService,
    private businessFloatService: BusinessFloatService,
    private partnerApiService: PartnerApiService,
    private exchangeRateService: ExchangeRateService,
    private platformSettingsService: PlatformSettingsService,
    private platformCommissionService: PlatformCommissionService,
    private p2pRealtime: P2pRealtimeService,
    private notificationService: NotificationService,
  ) {}

  async create(userId: string, dto: CreateWithdrawalDto) {
    if (dto.integrationToken) {
      const session = await this.integrationRedirectService.findValidSession(dto.integrationToken);
      if (session.userId.toString() !== userId) {
        throw new ForbiddenException('Integration session does not match user');
      }
      if (session.amount !== dto.amount) {
        throw new BadRequestException(`Amount must be ${session.amount} as per integration session`);
      }
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    const businessId = await this.businessService.findBusinessIdForUser(user);
    await this.validateDestination(dto, businessId);
    if (dto.method !== PaymentMethod.USDT) {
      const minAmt = await this.platformSettingsService.getMinTransactionAmount();
      if (dto.amount < minAmt) {
        throw new BadRequestException(`Minimum withdrawal is ₹${minAmt}`);
      }
    }
    if (businessId) {
      await this.businessService.assertWithdrawalsEnabled(businessId);
    }
    const isInvestor = user.role === UserRole.INVESTOR;
    if (businessId && !isInvestor) {
      await this.businessService.assertWithdrawalMethodAllowed(businessId, dto.method);
    }
    if (isInvestor) {
      await this.platformSettingsService.assertInvestorWithdrawalMethodAllowed(dto.method);
    }

    const isUsdtMethod = dto.method === PaymentMethod.USDT;
    const businessRates = businessId
      ? await this.businessService.getUsdtRates(businessId)
      : null;
    // User may request any wallet-funded amount; pay-limit is enforced when
    // admin/business lists the WD for Platform Payment (not on create).
    let currency = isUsdtMethod ? Currency.USDT : Currency.INR;
    let payoutAmount = dto.amount;
    let lockAmount = dto.amount;
    let partnerDebitAmount = dto.amount;
    let sourceCurrency: Currency | undefined;
    let sourceAmount: number | undefined;
    let exchangeRate: number | undefined;
    let partnerDebited = false;
    let p2pAdvanceCredited = false;
    let p2pAdvanceAmount = 0;

    /**
     * USDT method: amount is INR. Convert to USDT payout and lock INR
     * (same as investor). Partner USDT wallets debit/lock USDT instead.
     */
    let walletCurrency: Currency = currency;
    if (isUsdtMethod) {
      exchangeRate = this.exchangeRateService.resolveUsdtInrRate('buy', businessRates);
      sourceCurrency = Currency.INR;
      sourceAmount = dto.amount;
      lockAmount = dto.amount;
      currency = Currency.USDT;
      payoutAmount = this.exchangeRateService.inrToUsdt(dto.amount, businessRates);
      walletCurrency = Currency.INR;
      if (payoutAmount <= 0) {
        throw new BadRequestException('Amount too small for USDT conversion');
      }
    }

    const isBusinessLinkedUser = Boolean(businessId) && !isInvestor;

    // Partner SSO users: spend partner wallet when funded; otherwise P2P request
    // via FinGuard advance credit + lock. Pay-limit is enforced on list/approve, not create.
    if (isBusinessLinkedUser && businessId) {
      const business = await this.businessService.findDocumentById(businessId);
      if (this.partnerApiService.isConfigured(business)) {
        try {
          const partnerUserId = partnerUserIdFromExternalRef(user.externalRef);
          const partnerBal = await this.partnerApiService.fetchBalance(business, {
            email: user.email,
            userId: partnerUserId,
          });
          const partnerCurrency = (partnerBal.currency || 'INR').toUpperCase();

          let canDebitPartner = false;
          if (partnerCurrency === 'USDT' && !isUsdtMethod) {
            exchangeRate = this.exchangeRateService.resolveUsdtInrRate(
              'buy',
              businessRates,
            );
            sourceCurrency = Currency.USDT;
            sourceAmount = this.exchangeRateService.inrToUsdt(
              dto.amount,
              businessRates,
            );
            partnerDebitAmount = sourceAmount;
            currency = Currency.INR;
            payoutAmount = dto.amount;
            walletCurrency = Currency.INR;
            canDebitPartner = partnerBal.availableBalance >= partnerDebitAmount;
          } else if (partnerCurrency === 'USDT' && isUsdtMethod) {
            exchangeRate = this.exchangeRateService.resolveUsdtInrRate(
              'buy',
              businessRates,
            );
            sourceCurrency = Currency.USDT;
            sourceAmount = payoutAmount;
            partnerDebitAmount = payoutAmount;
            lockAmount = payoutAmount;
            walletCurrency = Currency.USDT;
            canDebitPartner = partnerBal.availableBalance >= partnerDebitAmount;
          } else {
            sourceCurrency = Currency.INR;
            sourceAmount = dto.amount;
            partnerDebitAmount = dto.amount;
            walletCurrency = Currency.INR;
            canDebitPartner = partnerBal.availableBalance >= partnerDebitAmount;
          }

          if (canDebitPartner) {
            await this.partnerApiService.debitPartner(
              business,
              user.email,
              partnerDebitAmount,
              `P2P withdrawal ${dto.method.toUpperCase()}` +
                (exchangeRate
                  ? isUsdtMethod
                    ? ` — ₹${dto.amount} → ${payoutAmount} USDT @ ${exchangeRate}`
                    : ` — ${partnerDebitAmount} USDT → ₹${payoutAmount} @ ${exchangeRate}`
                  : ''),
              partnerUserId,
            );
            partnerDebited = true;

            // Mirror lock currency into FinGuard so lock / cancel / approve flows keep working.
            // Do NOT bump totalDeposited — this is not a user deposit.
            const mirrorWallet = await this.walletService.getOrCreate(
              userId,
              walletCurrency,
              businessId,
            );
            await this.walletService.credit(
              mirrorWallet._id.toString(),
              lockAmount,
              false,
            );
          }
        } catch {
          // Partner unreachable / not funded — business-code users may still open P2P requests.
        }
      }
    }

    const freshWallet = await this.walletService.getOrCreate(userId, walletCurrency, businessId);
    const available = freshWallet.balance - freshWallet.lockedBalance;
    if (available < lockAmount) {
      if (isBusinessLinkedUser) {
        // Top up so lock accounting works; reversed on cancel/reject if not partner-funded.
        p2pAdvanceAmount = Math.round((lockAmount - available) * 1e6) / 1e6;
        await this.walletService.credit(freshWallet._id.toString(), p2pAdvanceAmount, false);
        if (!partnerDebited) p2pAdvanceCredited = true;
      } else {
        if (partnerDebited && businessId) {
          await this.refundPartnerDebit(user, businessId, partnerDebitAmount);
        }
        throw new BadRequestException('Insufficient balance');
      }
    }

    const referenceId = `WDR-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    try {
      await this.walletService.lock(freshWallet._id.toString(), lockAmount);
    } catch (err) {
      if (partnerDebited && businessId) {
        await this.refundPartnerDebit(user, businessId, partnerDebitAmount);
        try {
          await this.walletService.debit(freshWallet._id.toString(), lockAmount, false);
        } catch {
          /* best-effort rollback */
        }
      } else if (p2pAdvanceCredited && p2pAdvanceAmount > 0) {
        try {
          await this.walletService.debit(freshWallet._id.toString(), p2pAdvanceAmount, false);
        } catch {
          /* best-effort rollback */
        }
      }
      throw err;
    }

    const withdrawal = await this.withdrawalModel.create({
      referenceId,
      userId: new Types.ObjectId(userId),
      businessId: businessId ? new Types.ObjectId(businessId) : undefined,
      walletId: freshWallet._id,
      amount: payoutAmount,
      currency,
      method: dto.method,
      status: TransactionStatus.PENDING,
      p2pListStatus: 'awaiting',
      origin: isInvestor ? 'investor' : 'user',
      upiDetails: dto.upiDetails,
      bankDetails: dto.bankDetails,
      usdtDetails: dto.usdtDetails,
      cdmDetails: dto.cdmDetails,
      partnerDebited,
      p2pAdvanceCredited,
      p2pAdvanceAmount: p2pAdvanceCredited ? p2pAdvanceAmount : undefined,
      sourceAmount,
      sourceCurrency,
      exchangeRate,
    });

    if (dto.integrationToken) {
      await this.integrationRedirectService.consumeSession(
        dto.integrationToken,
        userId,
        withdrawal._id.toString(),
        withdrawal.referenceId,
      );
    }

    this.p2pRealtime.emitListChanged('updated', {
      withdrawalId: withdrawal._id.toString(),
    });
    return withdrawal;
  }

  /** Business owner opens a P2P withdrawal against remaining pay limit. Admin must verify. */
  async createForBusiness(ownerUserId: string, dto: CreateWithdrawalDto) {
    if (dto.integrationToken) {
      throw new BadRequestException('Integration token is not valid for business withdrawals');
    }

    const business = await this.businessService.findForActor(ownerUserId);
    const businessId = business._id.toString();
    await this.validateDestination(dto, businessId);
    await this.businessService.assertWithdrawalsEnabled(businessId);
    await this.businessService.assertWithdrawalMethodAllowed(businessId, dto.method);
    const walletOwnerId = business.ownerId.toString();
    if (dto.method !== PaymentMethod.USDT) {
      const minAmt = await this.platformSettingsService.getMinTransactionAmount();
      if (dto.amount < minAmt) {
        throw new BadRequestException(`Minimum withdrawal is ₹${minAmt}`);
      }
    }
    const isUsdtMethod = dto.method === PaymentMethod.USDT;
    const businessRates = await this.businessService.getUsdtRates(businessId);
    const needInr = isUsdtMethod
      ? this.exchangeRateService.usdtToInr(dto.amount, businessRates)
      : dto.amount;
    // Remaining must cover principal + full WD commission (business + platform both burn pay limit).
    const businessFeeTake = await this.commissionService.calculate(
      dto.amount,
      CommissionTarget.BUSINESS,
      businessId,
      dto.method,
      'withdrawal',
    );
    const platformFeeTake = await this.commissionService.calculate(
      dto.amount,
      CommissionTarget.PLATFORM,
      businessId,
      dto.method,
      'withdrawal',
    );
    const feeRaw = businessFeeTake.amount + platformFeeTake.amount;
    const feeInr = isUsdtMethod
      ? this.exchangeRateService.usdtToInr(feeRaw, businessRates)
      : feeRaw;
    await this.businessService.assertP2pPayAmountAllowed(
      businessId,
      needInr + feeInr,
    );
    const currency = isUsdtMethod ? Currency.USDT : Currency.INR;
    const lockAmount = dto.amount;
    const usdtExchangeRate = isUsdtMethod
      ? this.exchangeRateService.resolveUsdtInrRate('buy', businessRates)
      : undefined;
    const wallet = await this.walletService.getOrCreate(walletOwnerId, currency, businessId);
    const available = wallet.balance - wallet.lockedBalance;
    let p2pAdvanceAmount = 0;
    if (available < lockAmount) {
      p2pAdvanceAmount = Math.round((lockAmount - available) * 1e6) / 1e6;
      await this.walletService.credit(wallet._id.toString(), p2pAdvanceAmount, false);
    }

    const wantHighlight = !!dto.priority;
    if (wantHighlight) {
      await this.businessService.consumeHighlightSlot(businessId);
    }

    try {
      const beforeLock =
        (await this.walletService.findById(wallet._id.toString())) || wallet;
      await this.walletService.lock(wallet._id.toString(), lockAmount);
      const afterLock = await this.walletService.findById(wallet._id.toString());

      const referenceId = `WDR-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
      const withdrawal = await this.withdrawalModel.create({
        referenceId,
        userId: new Types.ObjectId(walletOwnerId),
        businessId: new Types.ObjectId(businessId),
        walletId: wallet._id,
        amount: dto.amount,
        currency,
        method: dto.method,
        status: TransactionStatus.PENDING,
        p2pListStatus: 'awaiting',
        origin: 'business',
        upiDetails: dto.upiDetails,
        bankDetails: dto.bankDetails,
        usdtDetails: dto.usdtDetails,
        cdmDetails: dto.cdmDetails,
        // Snapshot rate for investor INR matching (do not set sourceCurrency=INR —
        // business locks a USDT wallet, not INR).
        exchangeRate: usdtExchangeRate,
        priority: wantHighlight,
        priorityAt: wantHighlight ? new Date() : undefined,
        p2pAdvanceCredited: p2pAdvanceAmount > 0,
        p2pAdvanceAmount: p2pAdvanceAmount > 0 ? p2pAdvanceAmount : undefined,
      });

      await this.transactionService.record({
        userId: walletOwnerId,
        walletId: wallet._id.toString(),
        type: LedgerType.LOCK,
        direction: LedgerDirection.DEBIT,
        amount: lockAmount,
        currency,
        balanceBefore: beforeLock.balance,
        balanceAfter: afterLock?.balance ?? beforeLock.balance,
        referenceType: 'business_withdrawal',
        referenceId: withdrawal._id.toString(),
        description: `Business withdrawal requested ${referenceId} — awaiting admin verify`,
        businessId,
        fromParty: business.name,
        toParty: 'P2P',
      });

      // Pay-limit remaining visibly drops for the open WD (hold).
      const holdInr = isUsdtMethod
        ? this.exchangeRateService.usdtToInr(dto.amount, businessRates)
        : dto.amount;
      await this.businessService.recordBusinessOriginHold(businessId, holdInr, {
        referenceType: 'business_withdrawal_hold',
        referenceId: withdrawal._id.toString(),
        reason: 'business_wd_hold',
      });

      this.p2pRealtime.emitListChanged('updated', {
        withdrawalId: withdrawal._id.toString(),
      });
      return withdrawal;
    } catch (err) {
      if (wantHighlight) {
        await this.businessService.releaseHighlightSlot(businessId);
      }
      throw err;
    }
  }

  /** Admin withdraws collected platform commission via P2P (listed immediately). */
  async createForPlatform(actorEmail: string, dto: CreateWithdrawalDto) {
    await this.validateDestination(dto);
    if (dto.integrationToken) {
      throw new BadRequestException(
        'Integration token is not valid for platform commission withdrawals',
      );
    }

    const isUsdtMethod = dto.method === PaymentMethod.USDT;
    const minAmt = isUsdtMethod
      ? 1
      : await this.platformSettingsService.getMinTransactionAmount();
    const currency = isUsdtMethod ? Currency.USDT : Currency.INR;
    const usdtExchangeRate = isUsdtMethod
      ? this.exchangeRateService.resolveUsdtInrRate('buy')
      : undefined;
    const { admin, wallet, availableBalance } =
      await this.platformCommissionService.getPlatformWallet(currency);

    const amountErr = platformCommissionWithdrawError({
      amount: dto.amount,
      available: availableBalance,
      minAmount: minAmt,
      method: dto.method,
    });
    if (amountErr) throw new BadRequestException(amountErr);

    const lockAmount = dto.amount;
    const adminId = admin._id.toString();
    const beforeLock =
      (await this.walletService.findById(wallet._id.toString())) || wallet;
    await this.walletService.lock(wallet._id.toString(), lockAmount);
    const afterLock = await this.walletService.findById(wallet._id.toString());

    const referenceId = `WDR-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const withdrawal = await this.withdrawalModel.create({
      referenceId,
      userId: new Types.ObjectId(adminId),
      walletId: wallet._id,
      amount: dto.amount,
      currency,
      method: dto.method,
      status: TransactionStatus.PENDING,
      p2pListStatus: 'listed',
      p2pListedAt: new Date(),
      p2pListedBy: actorEmail,
      origin: 'user',
      upiDetails: dto.upiDetails,
      bankDetails: dto.bankDetails,
      usdtDetails: dto.usdtDetails,
      cdmDetails: dto.cdmDetails,
      exchangeRate: usdtExchangeRate,
    });

    await this.transactionService.record({
      userId: adminId,
      walletId: wallet._id.toString(),
      type: LedgerType.LOCK,
      direction: LedgerDirection.DEBIT,
      amount: lockAmount,
      currency,
      balanceBefore: beforeLock.balance,
      balanceAfter: afterLock?.balance ?? beforeLock.balance,
      referenceType: 'platform_commission_withdrawal',
      referenceId: withdrawal._id.toString(),
      description: `Platform commission withdrawal ${referenceId} — listed for P2P pay`,
      fromParty: 'Platform',
      toParty: 'P2P',
    });

    this.p2pRealtime.emitListChanged('listed', {
      withdrawalId: withdrawal._id.toString(),
    });
    return withdrawal;
  }

  private async refundPartnerDebit(
    user: UserDocument,
    businessId: string,
    amount: number,
    reason = 'P2P withdrawal cancelled/failed — refund',
  ) {
    const business = await this.businessService.findDocumentById(businessId);
    if (!this.partnerApiService.isConfigured(business)) return;
    await this.partnerApiService.creditPartner(
      business,
      user.email,
      amount,
      reason,
      partnerUserIdFromExternalRef(user.externalRef),
    );
  }

  async approve(withdrawalId: string, dto: ProcessWithdrawalDto, processedBy: string) {
    // Core settle (wallet + status) in optional txn. Fee/float/quota run after commit —
    // mixing those wallet writes with the txn caused write conflicts → 500 on mark-paid.
    const settled = await withOptionalTransaction(this.connection, async (session) => {
      const withdrawal = await this.withdrawalModel
        .findById(withdrawalId)
        .session(session || null);
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      if (
        withdrawal.status !== TransactionStatus.PENDING &&
        withdrawal.status !== TransactionStatus.PROCESSING
      ) {
        throw new BadRequestException('Withdrawal is not open for mark paid');
      }
      if ((withdrawal.paidAmount || 0) > 0) {
        throw new BadRequestException('Cannot approve — use split payment approvals');
      }
      const pendingPayments = await this.paymentModel
        .exists({
          withdrawalId: withdrawal._id,
          status: TransactionStatus.PENDING,
        })
        .session(session || null);
      if (pendingPayments) {
        throw new BadRequestException('Reject or approve pending split payments first');
      }

      const isUsdtPayout = withdrawal.method === PaymentMethod.USDT;
      const payoutRef = isUsdtPayout ? dto.txHash?.trim() : dto.utr?.trim();
      if (payoutRef) {
        await assertUniquePaymentRef({
          paymentModel: this.paymentModel,
          withdrawalModel: this.withdrawalModel,
          ref: payoutRef,
          isUsdt: isUsdtPayout,
          excludeWithdrawalId: withdrawal._id.toString(),
        });
      }

      const lockAmt = this.lockAmountFor(withdrawal);
      if (lockAmt <= 0) {
        throw new BadRequestException('Withdrawal has no locked amount to settle');
      }
      const wallet =
        (await this.walletService.findById(withdrawal.walletId.toString(), session || undefined)) ||
        (await this.walletService.getOrCreate(
          withdrawal.userId.toString(),
          withdrawal.currency,
          withdrawal.businessId?.toString(),
        ));

      let businessCommission = 0;
      if (withdrawal.businessId) {
        const take = await this.commissionService.calculate(
          withdrawal.amount,
          CommissionTarget.BUSINESS,
          withdrawal.businessId.toString(),
          withdrawal.method,
          'withdrawal',
        );
        businessCommission = take.amount;
      }

      const platformFee = await this.commissionService.calculate(
        withdrawal.amount,
        CommissionTarget.PLATFORM,
        withdrawal.businessId?.toString(),
        withdrawal.method,
        'withdrawal',
      );
      const platformCommission = platformFee.amount;
      withdrawal.commissionAmount = businessCommission + platformCommission;

      const wasListed = withdrawal.p2pListStatus === 'listed';
      const openInrForList =
        withdrawal.businessId && withdrawal.origin !== 'business' && wasListed
          ? this.openAmountInrForList(withdrawal)
          : 0;

      const balanceBefore = wallet.balance;
      await this.walletService.unlock(wallet._id.toString(), lockAmt, session || undefined);
      const updatedWallet = await this.walletService.debit(
        wallet._id.toString(),
        lockAmt,
        'totalWithdrawn',
        session || undefined,
      );

      if (dto.utr && withdrawal.upiDetails) withdrawal.upiDetails.utr = dto.utr;
      if (dto.utr && withdrawal.bankDetails) withdrawal.bankDetails.utr = dto.utr;
      if (dto.txHash && withdrawal.usdtDetails) withdrawal.usdtDetails.txHash = dto.txHash;
      if (dto.proofImageKey) withdrawal.approveProofKey = dto.proofImageKey;
      if (dto.proofImageUrl) withdrawal.approveProofUrl = dto.proofImageUrl;

      withdrawal.status = TransactionStatus.COMPLETED;
      withdrawal.processedBy = processedBy;
      withdrawal.completedAt = new Date();
      withdrawal.paidAmount = withdrawal.amount;
      withdrawal.p2pAdvanceCredited = false;
      await withdrawal.save({ session: session || undefined });

      await this.transactionService.record({
        userId: withdrawal.userId.toString(),
        walletId: wallet._id.toString(),
        type: LedgerType.WITHDRAWAL,
        direction: LedgerDirection.DEBIT,
        amount: lockAmt,
        currency: withdrawal.currency,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        referenceType:
          withdrawal.origin === 'business' ? 'business_withdrawal' : 'withdrawal',
        referenceId: withdrawal._id.toString(),
        description:
          withdrawal.origin === 'business'
            ? `Business withdrawal settled ${withdrawal.referenceId} by ${processedBy}`
            : `Withdrawal processed by ${processedBy}`,
        businessId: withdrawal.businessId?.toString(),
        fromParty: 'P2P',
        toParty: processedBy,
      });

      return {
        withdrawal,
        businessCommission,
        platformCommission,
        wasListed,
        openInrForList,
      };
    });

    const { withdrawal, businessCommission, platformCommission, wasListed, openInrForList } =
      settled;

    if (withdrawal.businessId) {
      await this.businessService.incrementStats(
        withdrawal.businessId.toString(),
        'totalWithdrawals',
        withdrawal.amount,
      );
      if (businessCommission > 0) {
        await this.businessService.incrementStats(
          withdrawal.businessId.toString(),
          'totalCommissionEarned',
          businessCommission,
        );
      }
    }

    if (platformCommission > 0 || businessCommission > 0) {
      const withdrawer = await this.userModel.findById(withdrawal.userId).exec();
      // WD fee already collected on Approve (list) — do not charge business again.
      const walletPrepaid = !!withdrawal.p2pListFeeWalletCollected;
      const businessFeeDue =
        withdrawal.origin !== 'business' && walletPrepaid ? 0 : businessCommission;
      if (platformCommission > 0 || businessFeeDue > 0) {
        await this.platformCommissionService.creditCollectedFees({
          platformAmount: platformCommission,
          businessAmount: businessFeeDue,
          currency: withdrawal.currency,
          fromUserId: withdrawal.userId.toString(),
          fromName: withdrawer?.name || 'Withdrawer',
          fromRole: withdrawer?.role,
          referenceType:
            withdrawal.origin === 'business' ? 'business_withdrawal' : 'withdrawal',
          referenceId: withdrawal._id.toString(),
          referenceLabel: withdrawal.referenceId,
          businessId: withdrawal.businessId?.toString(),
        });
      }
    }

    const quotaInr =
      withdrawal.currency === Currency.USDT
        ? this.exchangeRateService.usdtToInr(withdrawal.amount)
        : withdrawal.amount;

    if (withdrawal.businessId) {
      const bizId = withdrawal.businessId.toString();

      if (withdrawal.origin === 'business') {
        // Business WD: burn full fee (business + platform) + migrate hold → used.
        // holdRelease reinstates the completed WD in remainingBefore so the fee
        // ledger row shows Remaining after hold (e.g. ₹30k → ₹29.6k), not full seed.
        const feeSource = businessCommission + platformCommission;
        if (feeSource > 0) {
          const feeInr =
            withdrawal.currency === Currency.USDT
              ? this.exchangeRateService.usdtToInr(feeSource)
              : feeSource;
          await this.businessService.consumeP2pPay(bizId, feeInr, {
            referenceType: 'withdrawal_payment_fee',
            referenceId: withdrawal._id.toString(),
            reason: 'wd_fee',
            holdRelease: quotaInr,
          });
        }
        await this.businessService.consumeP2pPay(bizId, quotaInr, {
          referenceType: 'withdrawal',
          referenceId: withdrawal._id.toString(),
          holdRelease: quotaInr,
        });
      } else {
        // Direct mark-paid: drop unused list reserve; fee already burned on Approve when listed.
        if (wasListed && openInrForList > 0) {
          await this.businessService.releaseP2pPay(bizId, openInrForList, {
            referenceType: 'withdrawal',
            referenceId: withdrawal._id.toString(),
            reason: 'list_release',
          });
        }
        const listFeePrepaid = Math.round((withdrawal.p2pListFeeBurned || 0) * 100) / 100;
        if (listFeePrepaid > 0 || withdrawal.p2pListFeeWalletCollected) {
          withdrawal.p2pListFeeBurned = 0;
          withdrawal.p2pListFeeWalletCollected = false;
          await withdrawal.save();
        } else if (businessCommission > 0) {
          // Legacy listed WDs (fee not prepaid on Approve) or never listed.
          await this.businessService.consumeP2pPay(bizId, businessCommission, {
            referenceType: 'withdrawal_payment_fee',
            referenceId: withdrawal._id.toString(),
            reason: 'wd_fee',
          });
        }

        const withdrawer = await this.userModel.findById(withdrawal.userId).exec();
        const business = await this.businessModel.findById(withdrawal.businessId).exec();

        await this.businessService.creditP2pPayQuota(bizId, quotaInr, {
          referenceType: 'withdrawal',
          referenceId: withdrawal._id.toString(),
        });
        await this.businessService.incrementStats(bizId, 'totalDeposits', quotaInr);

        if (business) {
          await this.businessFloatService.creditFloatOnWithdrawalApprove(
            bizId,
            business.ownerId.toString(),
            withdrawal.amount,
            withdrawal.currency,
            withdrawal._id.toString(),
          );
        }

        await this.platformCommissionService.creditDepositGivenTo({
          amount: quotaInr,
          currency: Currency.INR,
          toUserId: withdrawal.userId.toString(),
          toName: withdrawer?.name || 'User',
          toRole: withdrawer?.role,
          fromName: business ? business.name : processedBy,
          fromRole: business ? UserRole.BUSINESS : UserRole.ADMIN,
          referenceType: 'withdrawal',
          referenceId: withdrawal._id.toString(),
          referenceLabel: withdrawal.referenceId,
          businessId: bizId,
        });
      }
    } else {
      const withdrawer = await this.userModel.findById(withdrawal.userId).exec();
      await this.platformCommissionService.creditDepositGivenTo({
        amount: quotaInr,
        currency: Currency.INR,
        toUserId: withdrawal.userId.toString(),
        toName: withdrawer?.name || 'User',
        toRole: withdrawer?.role,
        fromName: processedBy,
        fromRole: UserRole.ADMIN,
        referenceType: 'withdrawal',
        referenceId: withdrawal._id.toString(),
        referenceLabel: withdrawal.referenceId,
      });
    }

    this.p2pRealtime.emitListChanged('updated', {
      withdrawalId: withdrawal._id.toString(),
    });

    return withdrawal;
  }

  /**
   * Business-owner approve: only for withdrawals belonging to their business.
   */
  async approveForBusiness(
    withdrawalId: string,
    businessId: string,
    dto: ProcessWithdrawalDto,
    processedBy: string,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId?.toString() !== businessId) {
      throw new ForbiddenException('Withdrawal does not belong to your business');
    }
    if (withdrawal.origin === 'business') {
      throw new ForbiddenException('Admin must approve business withdrawal requests');
    }
    return this.approve(withdrawalId, dto, processedBy);
  }

  async rejectForBusiness(
    withdrawalId: string,
    businessId: string,
    dto: RejectWithdrawalDto,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId?.toString() !== businessId) {
      throw new ForbiddenException('Withdrawal does not belong to your business');
    }
    return this.reject(withdrawalId, dto);
  }

  /** Admin/sub-admin: mark paid / settle. */
  async approveAsAdmin(
    withdrawalId: string,
    dto: ProcessWithdrawalDto,
    processedBy: string,
    actor?: Pick<AuthenticatedUser, 'role' | 'assignedBusinessIds'>,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());
    return this.approve(withdrawalId, dto, processedBy);
  }

  async rejectAsAdmin(
    withdrawalId: string,
    dto: RejectWithdrawalDto,
    actor?: Pick<AuthenticatedUser, 'role' | 'assignedBusinessIds'>,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());
    return this.reject(withdrawalId, dto);
  }

  async reject(withdrawalId: string, dto: RejectWithdrawalDto) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (
      withdrawal.status !== TransactionStatus.PENDING &&
      withdrawal.status !== TransactionStatus.PROCESSING
    ) {
      throw new BadRequestException('Withdrawal cannot be rejected');
    }
    const pendingPayments = await this.paymentModel.exists({
      withdrawalId: withdrawal._id,
      status: TransactionStatus.PENDING,
    });
    if (pendingPayments) {
      throw new BadRequestException(
        'Resolve pending/disputed payments first (approve or reject each payment)',
      );
    }

    const paidAmount = Math.round((withdrawal.paidAmount || 0) * 100) / 100;
    const wasListed = withdrawal.p2pListStatus === 'listed';
    // Remaining unpaid principal + unused prepaid fee → business limit;
    // unused fee also deducted from admin wallet.
    await this.releaseListedQuota(withdrawal, 'withdrawal_reject', { wasListed });

    // Unlock only the unpaid remainder (paid slices already unlocked+debited on confirm).
    await this.unlockRemainingForReject(withdrawal);

    if (paidAmount > 0) {
      // Partial close: keep confirmed pays, cancel remaining open.
      withdrawal.status = TransactionStatus.COMPLETED;
      withdrawal.completedAt = new Date();
      withdrawal.failureReason = `Remaining open rejected: ${dto.reason}`;
      withdrawal.p2pListStatus = 'rejected';
      withdrawal.p2pListRejectReason = dto.reason;
    } else {
      await this.releasePartnerMirror(withdrawal);
      withdrawal.status = TransactionStatus.REJECTED;
      withdrawal.failureReason = dto.reason;
      if (withdrawal.p2pListStatus === 'listed' || wasListed) {
        withdrawal.p2pListStatus = 'rejected';
        withdrawal.p2pListRejectReason = dto.reason;
      }
    }
    await withdrawal.save();

    if (paidAmount <= 0 && withdrawal.origin === 'business' && withdrawal.businessId) {
      const holdInr =
        withdrawal.currency === Currency.USDT && withdrawal.exchangeRate
          ? this.exchangeRateService.usdtToInr(withdrawal.amount)
          : withdrawal.amount;
      await this.businessService.recordBusinessOriginHoldRelease(
        withdrawal.businessId.toString(),
        holdInr,
        {
          referenceType: 'business_withdrawal_hold_release',
          referenceId: withdrawal._id.toString(),
          reason: 'business_wd_hold_release',
        },
      );
    }

    this.p2pRealtime.emitListChanged('unlisted', {
      withdrawalId: withdrawal._id.toString(),
    });
    return withdrawal;
  }

  /**
   * Publish withdrawal to the P2P pay list (admin or owning business).
   * Distinct from final payout `approve`.
   */
  async listForP2p(
    withdrawalId: string,
    actor: {
      userId: string;
      email: string;
      role: UserRole;
      assignedBusinessIds?: string[];
    },
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());

    if (
      withdrawal.status !== TransactionStatus.PENDING &&
      withdrawal.status !== TransactionStatus.PROCESSING
    ) {
      throw new BadRequestException('Only open withdrawals can be listed for P2P');
    }

    const remaining =
      withdrawal.amount - (withdrawal.paidAmount || 0) - (withdrawal.reservedAmount || 0);
    if (remaining <= 0) {
      throw new BadRequestException('Withdrawal has no remaining amount to list');
    }

    if (actor.role === UserRole.BUSINESS) {
      const business = await this.businessService.findForActor(actor.userId);
      await this.assertWithdrawalBelongsToBusiness(
        withdrawal,
        business._id.toString(),
      );
      if (withdrawal.origin === 'business') {
        throw new ForbiddenException('Admin must verify business withdrawal requests');
      }
    } else if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Not allowed to list withdrawals for P2P');
    }

    if (withdrawal.p2pListStatus === 'listed') {
      return withdrawal;
    }

    const tatMs = await this.platformSettingsService.getTatMs();
    const createdAt = (withdrawal as unknown as { createdAt?: Date }).createdAt;
    if (
      withdrawal.origin !== 'business' &&
      createdAt &&
      Date.now() - new Date(createdAt).getTime() < tatMs
    ) {
      const remainingSec = Math.ceil(
        (tatMs - (Date.now() - new Date(createdAt).getTime())) / 1000,
      );
      throw new BadRequestException(
        `User cancel window still active (${remainingSec}s remaining). Wait until TAT expires before listing for Platform Payment.`,
      );
    }

    // User/investor WDs: on Approve, burn open principal + full WD fee from pay limit.
    if (withdrawal.businessId && withdrawal.origin !== 'business') {
      await this.reserveListQuotaAndBurnFee(
        withdrawal,
        withdrawal.businessId.toString(),
      );
    }

    // Approve = verified for payout. Status stays pending; request becomes visible
    // to all users/investors on the pay list (except the owner).
    withdrawal.p2pListStatus = 'listed';
    withdrawal.p2pListedAt = new Date();
    withdrawal.p2pListedBy = actor.email || actor.userId;
    withdrawal.p2pListRejectReason = undefined;
    await withdrawal.save();

    this.p2pRealtime.emitListChanged('listed', {
      withdrawalId: withdrawal._id.toString(),
    });
    return withdrawal;
  }

  /**
   * On Approve / auto-list-via-assign: reserve open principal + burn full WD fee
   * on pay-limit AND collect wallet fee business→admin (so admin ledger shows IN
   * immediately). Later payments skip wallet fee (p2pListFeeWalletCollected) and
   * only consume the prepaid burned remainder; investor bonus still OUT on pay.
   */
  private async reserveListQuotaAndBurnFee(
    withdrawal: WithdrawalDocument,
    businessId: string,
  ) {
    const openInr = this.openAmountInrForList(withdrawal);
    if (openInr <= 0) return;
    await this.assertListApprovalFeeHeadroom(businessId, withdrawal, openInr);
    const feeTake = await this.commissionService.calculate(
      openInr,
      CommissionTarget.BUSINESS,
      businessId,
      withdrawal.method,
      'withdrawal',
    );
    const feeInr = Math.round((feeTake.amount || 0) * 100) / 100;
    await this.businessService.reserveP2pPay(businessId, openInr, {
      referenceType: 'withdrawal_list',
      referenceId: withdrawal._id.toString(),
      reason: 'list_reserve',
    });
    if (feeInr > 0) {
      await this.businessService.consumeP2pPay(businessId, feeInr, {
        referenceType: 'withdrawal_payment_fee',
        referenceId: withdrawal._id.toString(),
        reason: 'wd_fee',
      });
      withdrawal.p2pListFeeBurned = feeInr;
      // Wallet: business → admin now (business ledger hides this OUT; shows pay-limit fee).
      if (!withdrawal.p2pListFeeWalletCollected) {
        const withdrawer = await this.userModel.findById(withdrawal.userId).exec();
        await this.platformCommissionService.creditCollectedFees({
          platformAmount: 0,
          businessAmount: feeInr,
          currency: Currency.INR,
          fromUserId: withdrawal.userId.toString(),
          fromName: withdrawer?.name || 'Withdrawer',
          fromRole: withdrawer?.role,
          referenceType: 'withdrawal_list_fee',
          referenceId: withdrawal._id.toString(),
          referenceLabel: withdrawal.referenceId,
          businessId,
        });
        withdrawal.p2pListFeeWalletCollected = true;
      }
    }
  }

  /** Open list amount in INR (amount − paid − reserved). */
  private openAmountInrForList(withdrawal: WithdrawalDocument): number {
    const open = Math.max(
      0,
      withdrawal.amount - (withdrawal.paidAmount || 0) - (withdrawal.reservedAmount || 0),
    );
    if (open <= 0) return 0;
    return withdrawal.method === PaymentMethod.USDT
      ? this.exchangeRateService.usdtToInr(open)
      : open;
  }

  /** Unpaid principal still owed WD fee when paid (includes reserved pending pays). */
  private unpaidAmountInrForFee(withdrawal: WithdrawalDocument): number {
    const unpaid = Math.max(0, withdrawal.amount - (withdrawal.paidAmount || 0));
    if (unpaid <= 0) return 0;
    return withdrawal.method === PaymentMethod.USDT
      ? this.exchangeRateService.usdtToInr(unpaid)
      : unpaid;
  }

  /** Unpaid listed principal still in p2pPayUsed (do not subtract pending reserved pays). */
  private unpaidListReserveInr(withdrawal: WithdrawalDocument): number {
    return this.unpaidAmountInrForFee(withdrawal);
  }

  private async releaseListedQuota(
    withdrawal: WithdrawalDocument,
    referenceType: string,
    opts?: { wasListed?: boolean },
  ) {
    const listed =
      opts?.wasListed ?? withdrawal.p2pListStatus === 'listed';
    if (!listed) return;
    if (withdrawal.businessId && withdrawal.origin !== 'business') {
      const bizId = withdrawal.businessId.toString();
      // Visible refund refs (not silent list_release churn from payment settle).
      const refundRefType = `${referenceType}_refund`;
      const openInr = this.unpaidListReserveInr(withdrawal);
      if (openInr > 0) {
        await this.businessService.releaseP2pPay(bizId, openInr, {
          referenceType: refundRefType,
          referenceId: withdrawal._id.toString(),
          reason: 'reject_refund',
        });
      }
      // Refund WD fee prepaid on Approve for the unpaid remainder (limit + admin wallet).
      const feeLeft = Math.round((withdrawal.p2pListFeeBurned || 0) * 100) / 100;
      if (feeLeft > 0) {
        await this.businessService.releaseP2pPay(bizId, feeLeft, {
          referenceType: refundRefType,
          referenceId: withdrawal._id.toString(),
          reason: 'reject_refund',
        });
        if (withdrawal.p2pListFeeWalletCollected) {
          await this.platformCommissionService.refundCollectedBusinessFee({
            amount: feeLeft,
            currency: Currency.INR,
            businessId: bizId,
            referenceType: 'withdrawal_list_fee_refund',
            referenceId: withdrawal._id.toString(),
            referenceLabel: withdrawal.referenceId,
          });
        }
        withdrawal.p2pListFeeBurned = 0;
        withdrawal.p2pListFeeWalletCollected = false;
      }
    }
    if (withdrawal.p2pListStatus === 'listed') {
      withdrawal.p2pListStatus = 'rejected';
    }
  }

  /**
   * Before listing/approving a WD: remaining pay limit must cover
   * new open principal + WD fees on already-listed opens + fee for this new open.
   */
  private async measureListApprovalFeeHeadroom(
    businessId: string,
    withdrawal: WithdrawalDocument,
    newOpenInr: number,
  ) {
    const remaining = await this.businessService.getP2pPayRemaining(businessId);

    const listed = await this.withdrawalModel
      .find({
        businessId: new Types.ObjectId(businessId),
        _id: { $ne: withdrawal._id },
        origin: { $ne: 'business' },
        p2pListStatus: 'listed',
        status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
      })
      .select(
        'amount paidAmount reservedAmount method currency sourceAmount exchangeRate p2pListFeeBurned',
      )
      .lean()
      .exec();

    const feeParts = await Promise.all(
      listed.map(async (w) => {
        // Fee already in p2pPayUsed from Approve — do not require headroom again.
        if ((w.p2pListFeeBurned || 0) > 0) return 0;
        const unpaidInr = this.unpaidAmountInrForFee(w as WithdrawalDocument);
        if (unpaidInr <= 0) return 0;
        const fee = await this.commissionService.calculate(
          unpaidInr,
          CommissionTarget.BUSINESS,
          businessId,
          w.method,
          'withdrawal',
        );
        return fee.amount || 0;
      }),
    );
    const existingListedOpenFees = roundMoney(
      feeParts.reduce((s, n) => s + n, 0),
    );

    const newFeeResult = await this.commissionService.calculate(
      newOpenInr,
      CommissionTarget.BUSINESS,
      businessId,
      withdrawal.method,
      'withdrawal',
    );
    const newWithdrawalFee = newFeeResult.amount || 0;
    const feesTotal = roundMoney(existingListedOpenFees + newWithdrawalFee);
    const needed = listApprovalHeadroomNeeded({
      newOpenInr,
      newWithdrawalFee,
      existingListedOpenFees,
    });
    return { remaining, needed, feesTotal, newOpenInr };
  }

  private async assertListApprovalFeeHeadroom(
    businessId: string,
    withdrawal: WithdrawalDocument,
    newOpenInr: number,
  ) {
    const headroom = await this.measureListApprovalFeeHeadroom(
      businessId,
      withdrawal,
      newOpenInr,
    );
    if (headroom.needed > headroom.remaining) {
      throw new BadRequestException(
        listApprovalHeadroomError({
          needed: headroom.needed,
          remaining: headroom.remaining,
          newOpenInr: headroom.newOpenInr,
          feesTotal: headroom.feesTotal,
        }),
      );
    }
  }

  /** Business/admin: toggle FIFO jump for an open withdrawal. */
  async setPriority(
    id: string,
    priority: boolean,
    actor: {
      userId: string;
      email?: string;
      role: UserRole;
      assignedBusinessIds?: string[];
    },
  ) {
    const withdrawal = await this.withdrawalModel.findById(id).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());
    if (
      withdrawal.status !== TransactionStatus.PENDING &&
      withdrawal.status !== TransactionStatus.PROCESSING
    ) {
      throw new BadRequestException('Only open withdrawals can change priority');
    }

    const wasPriority = !!withdrawal.priority;
    const nextPriority = !!priority;
    if (wasPriority === nextPriority) return withdrawal;

    let businessIdForQuota: string | null = null;
    if (actor.role === UserRole.BUSINESS) {
      const business = await this.businessService.findForActor(actor.userId);
      if (withdrawal.businessId?.toString() !== business._id.toString()) {
        throw new ForbiddenException('Withdrawal does not belong to your business');
      }
      businessIdForQuota = business._id.toString();
    } else if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Not allowed to set withdrawal priority');
    }

    if (businessIdForQuota) {
      if (nextPriority) {
        await this.businessService.consumeHighlightSlot(businessIdForQuota);
      } else {
        await this.businessService.releaseHighlightSlot(businessIdForQuota);
      }
    }

    withdrawal.priority = nextPriority;
    withdrawal.priorityAt = nextPriority ? new Date() : undefined;
    await withdrawal.save();
    this.p2pRealtime.emitListChanged('updated', {
      withdrawalId: withdrawal._id.toString(),
    });
    return withdrawal;
  }

  /** Remove / reject from P2P pay list (admin or owning business). */
  async rejectP2pList(
    withdrawalId: string,
    actor: {
      userId: string;
      email: string;
      role: UserRole;
      assignedBusinessIds?: string[];
    },
    reason?: string,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());

    if (actor.role === UserRole.BUSINESS) {
      const business = await this.businessService.findForActor(actor.userId);
      if (withdrawal.businessId?.toString() !== business._id.toString()) {
        throw new ForbiddenException('Withdrawal does not belong to your business');
      }
    } else if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Not allowed to unlist withdrawals');
    }

    const pendingPays = await this.paymentModel.exists({
      withdrawalId: withdrawal._id,
      status: TransactionStatus.PENDING,
    });
    if (pendingPays) {
      throw new BadRequestException(
        'Cannot unlist — pending/disputed payments exist. Resolve those first.',
      );
    }

    const wasListed = withdrawal.p2pListStatus === 'listed';
    withdrawal.p2pListStatus = 'rejected';
    withdrawal.p2pListedAt = undefined;
    withdrawal.p2pListedBy = actor.email || actor.userId;
    withdrawal.p2pListRejectReason = reason?.trim() || 'Removed from P2P pay list';
    withdrawal.set('assignedTo', null);
    withdrawal.set('assignedBy', undefined);
    withdrawal.set('assignedAt', undefined);
    await this.releaseListedQuota(withdrawal, 'withdrawal_unlist', { wasListed });
    await withdrawal.save();

    this.p2pRealtime.emitListChanged('unlisted', {
      withdrawalId: withdrawal._id.toString(),
    });
    return withdrawal;
  }

  /**
   * Assign a listed (or listable) withdrawal to one user/investor.
   * Only that assignee then sees it on the pay list and can submit UTR/slip.
   * Admin: any active user/investor. Business: own referred users only.
   */
  async assignPayer(
    withdrawalId: string,
    assigneeId: string,
    actor: {
      userId: string;
      email: string;
      role: UserRole;
      assignedBusinessIds?: string[];
    },
  ) {
    if (!Types.ObjectId.isValid(assigneeId)) {
      throw new BadRequestException('Invalid assignee');
    }

    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());

    if (
      withdrawal.status !== TransactionStatus.PENDING &&
      withdrawal.status !== TransactionStatus.PROCESSING
    ) {
      throw new BadRequestException('Only open withdrawals can be assigned');
    }

    const remaining =
      withdrawal.amount - (withdrawal.paidAmount || 0) - (withdrawal.reservedAmount || 0);
    if (remaining <= 0) {
      throw new BadRequestException('Withdrawal has no remaining amount to assign');
    }

    if (withdrawal.userId.toString() === assigneeId) {
      throw new BadRequestException('Cannot assign a withdrawal to its owner');
    }

    const assignee = await this.userModel.findById(assigneeId).exec();
    if (!assignee) throw new NotFoundException('Assignee not found');
    if (assignee.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Assignee must be an active user');
    }
    if (assignee.role !== UserRole.USER && assignee.role !== UserRole.INVESTOR) {
      throw new BadRequestException('Assign only to a user or investor');
    }

    if (actor.role === UserRole.BUSINESS) {
      const business = await this.businessService.findForActor(actor.userId);
      const bizId = business._id.toString();
      if (withdrawal.businessId?.toString() !== bizId) {
        throw new ForbiddenException('Withdrawal does not belong to your business');
      }
      const assigneeBiz = assignee.referredByBusiness?.toString();
      if (assigneeBiz !== bizId) {
        throw new ForbiddenException('You can only assign to your own users');
      }
      // Business assigns to end-users only (not investors).
      if (assignee.role !== UserRole.USER) {
        throw new BadRequestException('Assign only to your business users');
      }
    } else if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Not allowed to assign withdrawals');
    }

    if (assignee.role === UserRole.INVESTOR) {
      const owner = await this.userModel.findById(withdrawal.userId).select('role').lean().exec();
      if (isInvestorToInvestorPay(assignee.role, owner?.role)) {
        throw new BadRequestException('Cannot assign an investor withdrawal to another investor');
      }
    }

    if (withdrawal.p2pListStatus !== 'listed') {
      if (actor.role === UserRole.BUSINESS && withdrawal.origin === 'business') {
        throw new ForbiddenException('Admin must verify business withdrawal requests');
      }
      const tatMs = await this.platformSettingsService.getTatMs();
      const createdAt = (withdrawal as unknown as { createdAt?: Date }).createdAt;
      if (
        withdrawal.origin !== 'business' &&
        createdAt &&
        Date.now() - new Date(createdAt).getTime() < tatMs
      ) {
        const remainingSec = Math.ceil(
          (tatMs - (Date.now() - new Date(createdAt).getTime())) / 1000,
        );
        throw new BadRequestException(
          `User cancel window still active (${remainingSec}s remaining). Wait until TAT expires before assigning.`,
        );
      }

      if (withdrawal.businessId && withdrawal.origin !== 'business') {
        await this.reserveListQuotaAndBurnFee(
          withdrawal,
          withdrawal.businessId.toString(),
        );
      }

      withdrawal.p2pListStatus = 'listed';
      withdrawal.p2pListedAt = new Date();
      withdrawal.p2pListedBy = actor.email || actor.userId;
      withdrawal.p2pListRejectReason = undefined;
    }

    withdrawal.assignedTo = new Types.ObjectId(assigneeId);
    withdrawal.assignedBy = actor.email || actor.userId;
    withdrawal.assignedAt = new Date();
    withdrawal.set('claimLockedBy', null);
    withdrawal.set('claimLockedUntil', null);
    withdrawal.set('claimPayDeadline', null);
    await withdrawal.save();

    this.p2pRealtime.emitListChanged('listed', {
      withdrawalId: withdrawal._id.toString(),
    });

    await this.notificationService.send(
      assigneeId,
      'Withdrawal assigned to you',
      `Pay ${withdrawal.referenceId} of ₹${withdrawal.amount}. Submit UTR or payment slip as proof.`,
      'info',
      'withdrawal',
      withdrawal._id.toString(),
    );

    return this.populateAssignment(withdrawal);
  }

  async unassignPayer(
    withdrawalId: string,
    actor: {
      userId: string;
      email: string;
      role: UserRole;
      assignedBusinessIds?: string[];
    },
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());

    if (actor.role === UserRole.BUSINESS) {
      const business = await this.businessService.findForActor(actor.userId);
      if (withdrawal.businessId?.toString() !== business._id.toString()) {
        throw new ForbiddenException('Withdrawal does not belong to your business');
      }
    } else if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Not allowed to unassign withdrawals');
    }

    if (!withdrawal.assignedTo) {
      return this.populateAssignment(withdrawal);
    }

    const pendingFromAssignee = await this.paymentModel.exists({
      withdrawalId: withdrawal._id,
      payerUserId: withdrawal.assignedTo,
      status: TransactionStatus.PENDING,
    });
    if (pendingFromAssignee) {
      throw new BadRequestException(
        'Cannot unassign — assignee has a pending/disputed payment. Resolve it first.',
      );
    }

    withdrawal.set('assignedTo', null);
    withdrawal.set('assignedBy', undefined);
    withdrawal.set('assignedAt', undefined);
    await withdrawal.save();
    this.p2pRealtime.emitListChanged('updated', {
      withdrawalId: withdrawal._id.toString(),
    });
    return this.populateAssignment(withdrawal);
  }

  private async populateAssignment(withdrawal: WithdrawalDocument) {
    await withdrawal.populate('assignedTo', ADMIN_USER_FIELDS);
    await withdrawal.populate('userId', ADMIN_USER_FIELDS);
    return withdrawal;
  }

  private async assertUserCanMutateDestination(
    withdrawal: WithdrawalDocument,
    userId: string,
    action: 'cancel' | 'edit',
  ) {
    if (withdrawal.userId.toString() !== userId) {
      throw new ForbiddenException('Not your withdrawal');
    }

    const tatMs = await this.platformSettingsService.getTatMs();
    const createdAt = (withdrawal as unknown as { createdAt?: Date }).createdAt;
    const can = userCanCancelWithdrawal({
      status: withdrawal.status,
      p2pListStatus: withdrawal.p2pListStatus,
      paidAmount: withdrawal.paidAmount,
      createdAt,
      nowMs: Date.now(),
      tatMs,
    });
    if (can) return;

    if (withdrawal.p2pListStatus === 'listed') {
      throw new BadRequestException(
        `Cannot ${action} after Platform Payment list approval. Contact business or admin.`,
      );
    }
    throw new BadRequestException(
      `Edit window expired; contact business or admin to ${action}.`,
    );
  }

  async cancel(withdrawalId: string, userId: string) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.origin === 'business') {
      if (withdrawal.userId.toString() !== userId) {
        throw new ForbiddenException('Not your withdrawal');
      }
      if (withdrawal.p2pListStatus === 'listed' || (withdrawal.paidAmount || 0) > 0) {
        throw new BadRequestException('Cannot cancel after admin verify. Contact admin.');
      }
      if (
        withdrawal.status !== TransactionStatus.PENDING &&
        withdrawal.status !== TransactionStatus.PROCESSING
      ) {
        throw new BadRequestException('Withdrawal cannot be cancelled');
      }
      return this.cancelWithdrawalRecord(withdrawal);
    }
    await this.assertUserCanMutateDestination(withdrawal, userId, 'cancel');
    return this.cancelWithdrawalRecord(withdrawal);
  }

  async updateDestination(
    withdrawalId: string,
    _userId: string,
    _dto: UpdateWithdrawalDestinationDto,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    throw new BadRequestException(
      'Withdrawal details cannot be edited. Cancel the request and create a new one.',
    );
  }

  private async assertWithdrawalBelongsToBusiness(
    withdrawal: WithdrawalDocument,
    businessId: string,
  ) {
    if (withdrawal.businessId?.toString() === businessId) return;
    const owner = await this.userModel
      .findById(withdrawal.userId)
      .select('referredByBusiness staffBusinessId')
      .lean()
      .exec();
    const linked =
      owner?.referredByBusiness?.toString() === businessId ||
      owner?.staffBusinessId?.toString() === businessId;
    if (!linked) {
      throw new ForbiddenException('Withdrawal does not belong to this business');
    }
    // Heal missing businessId so pay-limit / approve paths work
    if (!withdrawal.businessId) {
      withdrawal.businessId = new Types.ObjectId(businessId);
      await withdrawal.save();
    }
  }

  async findByReferenceForBusiness(businessId: string, referenceId: string) {
    const withdrawal = await this.withdrawalModel
      .findOne({ referenceId, businessId: new Types.ObjectId(businessId) })
      .exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    return withdrawal;
  }

  async findByIdForBusiness(id: string, businessId: string) {
    const withdrawal = await this.withdrawalModel
      .findById(id)
      .populate('userId', 'name email externalRef businessUserCode')
      .populate('assignedTo', 'name email role businessUserCode')
      .exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    await this.assertWithdrawalBelongsToBusiness(withdrawal, businessId);

    const tatMs = await this.platformSettingsService.getTatMs();
    const createdAt = (withdrawal as unknown as { createdAt?: Date }).createdAt;
    const tatLeft = remainingTatSeconds(createdAt, Date.now(), tatMs);

    const payments = await this.paymentModel
      .find({ withdrawalId: withdrawal._id })
      .sort({ createdAt: -1 })
      .exec();

    return {
      ...withdrawal.toObject(),
      remainingAmount: Math.max(0, withdrawal.amount - (withdrawal.paidAmount || 0)),
      readyForListApproval: tatLeft <= 0 || withdrawal.origin === 'business',
      tatSecondsRemaining: tatLeft,
      userEditExpiresAt:
        createdAt && withdrawal.origin !== 'business'
          ? new Date(new Date(createdAt).getTime() + tatMs).toISOString()
          : undefined,
      payments: payments.map((p) => this.toPaymentBrief(p)),
    };
  }

  async findByBusiness(businessId: string, opts: WithdrawalListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const bid = new Types.ObjectId(businessId);
    const tatMs = await this.platformSettingsService.getTatMs();
    const tatCutoff = tatCutoffDate(Date.now(), tatMs);

    // Include WDs tagged to this business, plus referred users (covers missing businessId).
    const referredUsers = await this.userModel
      .find({
        $or: [{ referredByBusiness: bid }, { referredByBusiness: businessId }],
      })
      .select('_id')
      .lean()
      .exec();
    const referredIds = referredUsers.map((u) => u._id);

    const and: Record<string, unknown>[] = [
      {
        $or: [
          { businessId: bid },
          { businessId },
          ...(referredIds.length ? [{ userId: { $in: referredIds } }] : []),
        ],
      },
      businessWithdrawalVisibilityFilter(tatCutoff),
    ];

    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') {
      and.push({ method: opts.method });
    }
    if (opts.origin === 'business') {
      and.push({ origin: 'business' });
    } else if (opts.origin === 'user') {
      and.push({ origin: { $ne: 'business' } });
    }
    if (search) {
      const escaped = escapeRegex(search);
      const matchedUsers = await this.userModel
        .find({
          $and: [
            {
              $or: [
                { referredByBusiness: bid },
                { referredByBusiness: businessId },
              ],
            },
            {
              $or: [
                { name: { $regex: escaped, $options: 'i' } },
                { email: { $regex: escaped, $options: 'i' } },
                { phone: { $regex: escaped, $options: 'i' } },
                { businessUserCode: { $regex: escaped, $options: 'i' } },
                { externalRef: { $regex: escaped, $options: 'i' } },
              ],
            },
          ],
        })
        .select('_id')
        .limit(50)
        .lean()
        .exec();
      const userIds = matchedUsers.map((u) => u._id);
      and.push({
        $or: [
          { referenceId: { $regex: escaped, $options: 'i' } },
          { 'upiDetails.upiId': { $regex: escaped, $options: 'i' } },
          { 'bankDetails.accountNumber': { $regex: escaped, $options: 'i' } },
          { 'bankDetails.accountHolderName': { $regex: escaped, $options: 'i' } },
          { 'usdtDetails.walletAddress': { $regex: escaped, $options: 'i' } },
          ...(userIds.length
            ? [{ userId: { $in: userIds } }, { assignedTo: { $in: userIds } }]
            : []),
        ],
      });
    }

    const filter = { $and: and };
    const sortSpec = listSortMap(sort, {
      newest: { priority: -1, createdAt: -1 },
      oldest: { priority: -1, createdAt: 1 },
      amount_desc: { priority: -1, amount: -1 },
      amount_asc: { priority: -1, amount: 1 },
      status: { priority: -1, status: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.withdrawalModel
        .find(filter)
        .populate('userId', 'name email externalRef businessUserCode')
        .populate('assignedTo', 'name email role businessUserCode')
        .skip(skip)
        .limit(limit)
        .sort(sortSpec)
        .exec(),
      this.withdrawalModel.countDocuments(filter).exec(),
    ]);

    const ids = items.map((w) => w._id);
    const payments = ids.length
      ? await this.paymentModel
          .find({ withdrawalId: { $in: ids } })
          .sort({ createdAt: -1 })
          .exec()
      : [];

    const byWithdrawal = new Map<string, typeof payments>();
    for (const p of payments) {
      const key = p.withdrawalId.toString();
      const list = byWithdrawal.get(key) || [];
      list.push(p);
      byWithdrawal.set(key, list);
    }

    return {
      items: items.map((w) => {
        const list = byWithdrawal.get(w._id.toString()) || [];
        const createdAt = (w as unknown as { createdAt?: Date }).createdAt;
        const tatLeft = remainingTatSeconds(createdAt, Date.now(), tatMs);
        return {
          ...w.toObject(),
          remainingAmount: Math.max(0, w.amount - (w.paidAmount || 0)),
          paymentCount: list.length,
          readyForListApproval: tatLeft <= 0 || w.origin === 'business',
          tatSecondsRemaining: tatLeft,
          userEditExpiresAt:
            createdAt && w.origin !== 'business'
              ? new Date(new Date(createdAt).getTime() + tatMs).toISOString()
              : undefined,
          payments: list.map((p) => this.toPaymentBrief(p)),
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  /** Full payment snapshot for business/admin transaction views (incl. commission cut). */
  private toPaymentBrief(p: WithdrawalPaymentDocument) {
    const commissionAmount =
      p.commissionAmount ?? p.estimatedCommissionAmount ?? 0;
    const bonusAmount = p.bonusAmount ?? p.estimatedBonusAmount ?? 0;
    const netCreditedAmount =
      p.netCreditedAmount ?? p.estimatedNetCredited ?? undefined;
    return {
      _id: p._id,
      referenceId: p.referenceId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      utr: p.utr,
      proofImageUrl: p.proofImageUrl,
      commissionAmount,
      bonusAmount,
      netCreditedAmount,
      estimatedCommissionAmount: p.estimatedCommissionAmount,
      estimatedBonusAmount: p.estimatedBonusAmount,
      estimatedNetCredited: p.estimatedNetCredited,
      rejectionReason: p.rejectionReason,
      createdAt: (p as { createdAt?: Date }).createdAt,
      completedAt: p.completedAt,
      autoApproveAt: p.autoApproveAt,
      notes: p.notes,
      disputedAt: p.disputedAt,
      disputeTicketId: p.disputeTicketId,
      payerUserId: p.payerUserId,
    };
  }

  async cancelForBusiness(businessId: string, referenceId: string) {
    const withdrawal = await this.findByReferenceForBusiness(businessId, referenceId);
    if (
      shouldHealCancelledListedQuota({
        status: withdrawal.status,
        p2pListStatus: withdrawal.p2pListStatus,
      })
    ) {
      await this.releaseListedQuota(withdrawal, 'withdrawal_cancel');
      await withdrawal.save();
      this.p2pRealtime.emitListChanged('unlisted', {
        withdrawalId: withdrawal._id.toString(),
      });
      return withdrawal;
    }
    return this.cancelWithdrawalRecord(withdrawal);
  }

  private async cancelWithdrawalRecord(withdrawal: WithdrawalDocument) {
    if (withdrawal.status !== TransactionStatus.PENDING && withdrawal.status !== TransactionStatus.PROCESSING) {
      throw new BadRequestException('Only pending withdrawals can be cancelled');
    }
    if ((withdrawal.paidAmount || 0) > 0) {
      throw new BadRequestException('Cannot cancel — payments already received');
    }
    const pendingPayments = await this.paymentModel.exists({
      withdrawalId: withdrawal._id,
      status: TransactionStatus.PENDING,
    });
    if (pendingPayments) {
      throw new BadRequestException('Wait for pending payments to be processed');
    }
    await this.releaseListedQuota(withdrawal, 'withdrawal_cancel');
    await this.walletService.unlock(
      withdrawal.walletId.toString(),
      this.lockAmountFor(withdrawal),
    );
    await this.releasePartnerMirror(withdrawal);
    withdrawal.status = TransactionStatus.CANCELLED;
    await withdrawal.save();
    if (withdrawal.origin === 'business' && withdrawal.businessId) {
      const holdInr =
        withdrawal.currency === Currency.USDT && withdrawal.exchangeRate
          ? this.exchangeRateService.usdtToInr(withdrawal.amount)
          : withdrawal.amount;
      await this.businessService.recordBusinessOriginHoldRelease(
        withdrawal.businessId.toString(),
        holdInr,
        {
          referenceType: 'business_withdrawal_hold_release',
          referenceId: withdrawal._id.toString(),
          reason: 'business_wd_hold_release',
        },
      );
    }
    this.p2pRealtime.emitListChanged('unlisted', {
      withdrawalId: withdrawal._id.toString(),
    });
    return withdrawal;
  }

  /** INR locked for investor USDT opens; otherwise withdrawal.amount. */
  private lockAmountFor(withdrawal: WithdrawalDocument) {
    if (
      withdrawal.sourceCurrency === Currency.INR &&
      withdrawal.currency === Currency.USDT &&
      withdrawal.sourceAmount
    ) {
      return withdrawal.sourceAmount;
    }
    return withdrawal.amount;
  }

  /**
   * Unlock only unpaid remainder on reject (paid slices already unlocked+debited).
   * USDT opens that lock INR use proportional sourceAmount.
   */
  private async unlockRemainingForReject(withdrawal: WithdrawalDocument) {
    const unpaid = Math.max(0, withdrawal.amount - (withdrawal.paidAmount || 0));
    if (unpaid <= 0) return;

    let unlockWant = unpaid;
    let unlockCurrency = withdrawal.currency;
    if (
      withdrawal.sourceCurrency === Currency.INR &&
      withdrawal.currency === Currency.USDT
    ) {
      unlockCurrency = Currency.INR;
      if (withdrawal.sourceAmount && withdrawal.amount > 0) {
        unlockWant =
          Math.round(withdrawal.sourceAmount * (unpaid / withdrawal.amount) * 100) / 100;
      } else {
        unlockWant = this.exchangeRateService.usdtToInr(unpaid);
      }
    }

    const wallet = await this.walletService.getOrCreate(
      withdrawal.userId.toString(),
      unlockCurrency,
      withdrawal.businessId?.toString(),
    );
    const amt = Math.min(wallet.lockedBalance || 0, unlockWant);
    if (amt > 0) {
      await this.walletService.unlock(wallet._id.toString(), amt);
    }
  }

  /** Undo FinGuard mirror / P2P advance when business-linked withdrawal is cancelled/rejected */
  private async releasePartnerMirror(withdrawal: WithdrawalDocument) {
    if (withdrawal.partnerDebited && withdrawal.businessId) {
      try {
        // Reverse mirror only — not a real withdrawal settlement
        await this.walletService.debit(withdrawal.walletId.toString(), withdrawal.amount, false);
      } catch {
        /* wallet may already be empty */
      }

      const user = await this.userModel.findById(withdrawal.userId).exec();
      if (user) {
        await this.refundPartnerDebit(
          user,
          withdrawal.businessId.toString(),
          withdrawal.sourceAmount ?? withdrawal.amount,
          `P2P withdrawal ${withdrawal.referenceId} cancelled — refund`,
        );
      }
      withdrawal.partnerDebited = false;
      return;
    }

    if (withdrawal.p2pAdvanceCredited) {
      const advance = withdrawal.p2pAdvanceAmount ?? withdrawal.amount;
      try {
        await this.walletService.debit(withdrawal.walletId.toString(), advance, false);
      } catch {
        /* wallet may already be empty */
      }
      withdrawal.p2pAdvanceCredited = false;
    }
  }

  async findByUser(userId: string, opts: WithdrawalListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const oid = new Types.ObjectId(userId);

    const and: Record<string, unknown>[] = [
      { $or: [{ userId: oid }, { userId }] },
    ];

    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') {
      and.push({ method: opts.method });
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
      newest: { priority: -1, createdAt: -1 },
      oldest: { priority: -1, createdAt: 1 },
      amount_desc: { priority: -1, amount: -1 },
      amount_asc: { priority: -1, amount: 1 },
      status: { priority: -1, status: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.withdrawalModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.withdrawalModel.countDocuments(filter).exec(),
    ]);

    const ids = items.map((w) => w._id);
    const payments = ids.length
      ? await this.paymentModel
          .find({ withdrawalId: { $in: ids } })
          .sort({ createdAt: -1 })
          .exec()
      : [];

    const byWithdrawal = new Map<string, typeof payments>();
    for (const p of payments) {
      const key = p.withdrawalId.toString();
      const list = byWithdrawal.get(key) || [];
      list.push(p);
      byWithdrawal.set(key, list);
    }

    const tatMs = await this.platformSettingsService.getTatMs();
    const now = Date.now();

    return {
      items: items.map((w) => {
        const list = byWithdrawal.get(w._id.toString()) || [];
        const createdAt = (w as unknown as { createdAt?: Date }).createdAt;
        const userEditExpiresAt = createdAt
          ? new Date(new Date(createdAt).getTime() + tatMs)
          : undefined;
        const listed = w.p2pListStatus === 'listed';
        const withinTat =
          !!createdAt && now - new Date(createdAt).getTime() <= tatMs;
        const cancellableStatus =
          w.status === TransactionStatus.PENDING ||
          w.status === TransactionStatus.PROCESSING;
        const userCanCancel =
          cancellableStatus &&
          !listed &&
          withinTat &&
          (w.paidAmount || 0) === 0;
        const userCanEdit = false;
        const tatSecondsRemaining =
          createdAt && withinTat
            ? Math.max(
                0,
                Math.ceil((tatMs - (now - new Date(createdAt).getTime())) / 1000),
              )
            : 0;

        return {
          ...w.toObject(),
          remainingAmount: Math.max(0, w.amount - (w.paidAmount || 0)),
          userCanCancel,
          userCanEdit,
          userEditExpiresAt,
          tatSecondsRemaining,
          payments: list.map((p) => ({
            _id: p._id,
            referenceId: p.referenceId,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            utr: p.utr,
            proofImageUrl: p.proofImageUrl,
            netCreditedAmount: p.netCreditedAmount,
            rejectionReason: p.rejectionReason,
            createdAt: (p as { createdAt?: Date }).createdAt,
            completedAt: p.completedAt,
            autoApproveAt: p.autoApproveAt,
            notes: p.notes,
            disputedAt: p.disputedAt,
            disputeTicketId: p.disputeTicketId,
          })),
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findPending(
    opts: WithdrawalListOpts = {},
    actor?: { role?: string; assignedBusinessIds?: string[] },
  ) {
    return this.findAll(
      {
        ...opts,
        status: opts.status || TransactionStatus.PENDING,
      },
      actor,
    );
  }

  async findAll(
    opts: WithdrawalListOpts = {},
    actor?: { role?: string; assignedBusinessIds?: string[] },
  ) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const tatMs = await this.platformSettingsService.getTatMs();
    const tatCutoff = tatCutoffDate(Date.now(), tatMs);
    const and: Record<string, unknown>[] = [
      adminWithdrawalVisibilityFilter(tatCutoff),
    ];

    const scope = businessScopeFilter(actor?.role, actor?.assignedBusinessIds);
    if (scope) and.push(scope);

    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') {
      and.push({ method: opts.method });
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

    const filter = and.length ? { $and: and } : {};
    const sortSpec = listSortMap(sort, {
      newest: { priority: -1, createdAt: -1 },
      oldest: { priority: -1, createdAt: 1 },
      amount_desc: { priority: -1, amount: -1 },
      amount_asc: { priority: -1, amount: 1 },
      status: { priority: -1, status: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.withdrawalModel
        .find(filter)
        .populate('userId', ADMIN_USER_FIELDS)
        .populate('assignedTo', ADMIN_USER_FIELDS)
        .populate('businessId', 'name referralCode')
        .skip(skip)
        .limit(limit)
        .sort(sortSpec)
        .exec(),
      this.withdrawalModel.countDocuments(filter).exec(),
    ]);
    return {
      items: await this.withAdminPayments(items),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findByIdForAdmin(
    id: string,
    actor?: Pick<AuthenticatedUser, 'role' | 'assignedBusinessIds'>,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid withdrawal id');
    }
    const withdrawal = await this.withdrawalModel
      .findById(id)
      .populate('userId', ADMIN_USER_FIELDS)
      .populate('assignedTo', ADMIN_USER_FIELDS)
      .populate('businessId', 'name referralCode')
      .exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    assertActorBusinessAccess(actor, withdrawal.businessId?.toString());
    const [enriched] = await this.withAdminPayments([withdrawal]);
    return enriched;
  }

  private async withAdminPayments(items: WithdrawalDocument[]) {
    const ids = items.map((w) => w._id);
    const payments = ids.length
      ? await this.paymentModel
          .find({ withdrawalId: { $in: ids } })
          .populate('payerUserId', ADMIN_USER_FIELDS)
          .sort({ createdAt: -1 })
          .exec()
      : [];

    const byWithdrawal = new Map<string, typeof payments>();
    for (const p of payments) {
      const key = p.withdrawalId.toString();
      const list = byWithdrawal.get(key) || [];
      list.push(p);
      byWithdrawal.set(key, list);
    }

    return items.map((w) => {
      const list = byWithdrawal.get(w._id.toString()) || [];
      return {
        ...w.toObject(),
        remainingAmount: Math.max(0, w.amount - (w.paidAmount || 0)),
        paymentCount: list.length,
        payments: list.map((p) => this.toPaymentBrief(p)),
      };
    });
  }

  private async validateDestination(
    dto: {
      method: PaymentMethod | string;
      upiDetails?: CreateWithdrawalDto['upiDetails'];
      bankDetails?: CreateWithdrawalDto['bankDetails'];
      usdtDetails?: CreateWithdrawalDto['usdtDetails'];
      cdmDetails?: CreateWithdrawalDto['cdmDetails'];
    },
    businessId?: string | null,
  ) {
    const settings = await this.platformSettingsService.get();
    const allowMobileNumber = await this.businessService.resolveAllowMobileNumberUpi(
      !!settings.allowMobileNumberUpi,
      businessId,
    );
    assertValidWithdrawalDestination(dto, {
      allowMobileNumber,
    });
  }
}
