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
  tatCutoffDate,
  userCanCancelWithdrawal,
} from './utils/withdrawal-visibility.util';
import { assertUniquePaymentRef } from './utils/payment-ref-uniqueness.util';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { PlatformCommissionService } from '../wallet/platform-commission.service';
import { feeCutNote } from '../wallet/utils/platform-commission-ledger.util';
import { platformCommissionWithdrawError } from './utils/platform-commission-withdraw.util';
import { P2pRealtimeService } from '../realtime/p2p-realtime.service';

export type WithdrawalListOpts = ListQueryOpts & { method?: string };

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
    await this.validateDestination(dto);

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
    if (dto.method !== PaymentMethod.USDT) {
      const minAmt = await this.platformSettingsService.getMinTransactionAmount();
      if (dto.amount < minAmt) {
        throw new BadRequestException(`Minimum withdrawal is ₹${minAmt}`);
      }
    }
    const businessId = await this.businessService.findBusinessIdForUser(user);
    if (businessId) {
      await this.businessService.assertWithdrawalsEnabled(businessId);
    }
    const isInvestor = user.role === UserRole.INVESTOR;

    const isUsdtMethod = dto.method === PaymentMethod.USDT;
    if (businessId && !isInvestor) {
      const needInr = isUsdtMethod
        ? this.exchangeRateService.usdtToInr(dto.amount)
        : dto.amount;
      await this.businessService.assertP2pPayAmountAllowed(businessId, needInr);
    }
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

    // Investor points are INR — USDT method converts INR → USDT open request, locks INR.
    if (isInvestor && isUsdtMethod) {
      exchangeRate = this.exchangeRateService.getUsdtInrRate();
      sourceCurrency = Currency.INR;
      sourceAmount = dto.amount;
      lockAmount = dto.amount;
      currency = Currency.USDT;
      payoutAmount = this.exchangeRateService.inrToUsdt(dto.amount);
      if (payoutAmount <= 0) {
        throw new BadRequestException('Amount too small for USDT conversion');
      }
    }

    const walletCurrency = isInvestor && isUsdtMethod ? Currency.INR : currency;
    const isBusinessLinkedUser = Boolean(businessId) && !isInvestor;

    // Partner SSO users: spend partner wallet when funded; otherwise P2P request
    // via FinGuard advance credit + lock — still capped by business remaining.
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
            exchangeRate = this.exchangeRateService.getUsdtInrRate();
            sourceCurrency = Currency.USDT;
            sourceAmount = this.exchangeRateService.inrToUsdt(dto.amount);
            partnerDebitAmount = sourceAmount;
            currency = Currency.INR;
            payoutAmount = dto.amount;
            canDebitPartner = partnerBal.availableBalance >= partnerDebitAmount;
          } else {
            sourceCurrency = partnerCurrency === 'USDT' ? Currency.USDT : Currency.INR;
            sourceAmount = dto.amount;
            partnerDebitAmount = dto.amount;
            canDebitPartner = partnerBal.availableBalance >= partnerDebitAmount;
          }

          if (canDebitPartner) {
            await this.partnerApiService.debitPartner(
              business,
              user.email,
              partnerDebitAmount,
              `P2P withdrawal ${dto.method.toUpperCase()}` +
                (exchangeRate
                  ? ` — ${partnerDebitAmount} USDT → ₹${payoutAmount} @ ${exchangeRate}`
                  : ''),
              partnerUserId,
            );
            partnerDebited = true;

            // Mirror payout currency into FinGuard so lock / cancel / approve flows keep working.
            // Do NOT bump totalDeposited — this is not a user deposit.
            const mirrorWallet = await this.walletService.getOrCreate(userId, currency, businessId);
            await this.walletService.credit(mirrorWallet._id.toString(), payoutAmount, false);
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

    return withdrawal;
  }

  /** Business owner opens a P2P withdrawal against remaining pay limit. Admin must verify. */
  async createForBusiness(ownerUserId: string, dto: CreateWithdrawalDto) {
    await this.validateDestination(dto);
    if (dto.integrationToken) {
      throw new BadRequestException('Integration token is not valid for business withdrawals');
    }

    const business = await this.businessService.findForActor(ownerUserId);
    const businessId = business._id.toString();
    await this.businessService.assertWithdrawalsEnabled(businessId);
    const walletOwnerId = business.ownerId.toString();
    if (dto.method !== PaymentMethod.USDT) {
      const minAmt = await this.platformSettingsService.getMinTransactionAmount();
      if (dto.amount < minAmt) {
        throw new BadRequestException(`Minimum withdrawal is ₹${minAmt}`);
      }
    }
    const isUsdtMethod = dto.method === PaymentMethod.USDT;
    const needInr = isUsdtMethod
      ? this.exchangeRateService.usdtToInr(dto.amount)
      : dto.amount;
    await this.businessService.assertP2pPayAmountAllowed(businessId, needInr);
    const currency = isUsdtMethod ? Currency.USDT : Currency.INR;
    const lockAmount = dto.amount;
    const wallet = await this.walletService.getOrCreate(walletOwnerId, currency, businessId);
    const available = wallet.balance - wallet.lockedBalance;
    let p2pAdvanceAmount = 0;
    if (available < lockAmount) {
      p2pAdvanceAmount = Math.round((lockAmount - available) * 1e6) / 1e6;
      await this.walletService.credit(wallet._id.toString(), p2pAdvanceAmount, false);
    }

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

    return withdrawal;
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
    return withOptionalTransaction(this.connection, async (session) => {
      const withdrawal = await this.withdrawalModel
        .findById(withdrawalId)
        .session(session || null);
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      if (withdrawal.status !== TransactionStatus.PENDING) {
        throw new BadRequestException('Withdrawal is not pending');
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
        );
        businessCommission = take.amount;

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

      const platformFee = await this.commissionService.calculate(
        withdrawal.amount,
        CommissionTarget.PLATFORM,
        withdrawal.businessId?.toString(),
        withdrawal.method,
      );
      const platformCommission = platformFee.amount;
      const commissionAmount = businessCommission + platformCommission;
      withdrawal.commissionAmount = commissionAmount;

      // Debit only what was locked — commission is recorded, not taken from unlocked shortfall
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
          (withdrawal.origin === 'business'
            ? `Business withdrawal settled ${withdrawal.referenceId} by ${processedBy}`
            : `Withdrawal processed by ${processedBy}`) +
          feeCutNote(platformCommission, businessCommission, withdrawal.currency),
        businessId: withdrawal.businessId?.toString(),
        fromParty: 'P2P',
        toParty: processedBy,
      });

      if (platformCommission > 0 || businessCommission > 0) {
        const withdrawer = await this.userModel.findById(withdrawal.userId).exec();
        await this.platformCommissionService.creditCollectedFees({
          platformAmount: platformCommission,
          businessAmount: businessCommission,
          currency: withdrawal.currency,
          fromUserId: withdrawal.userId.toString(),
          fromName: withdrawer?.name || 'Withdrawer',
          fromRole: withdrawer?.role,
          referenceType:
            withdrawal.origin === 'business' ? 'business_withdrawal' : 'withdrawal',
          referenceId: withdrawal._id.toString(),
          referenceLabel: withdrawal.referenceId,
          businessId: withdrawal.businessId?.toString(),
          session: session || undefined,
        });
      }

      const quotaInr =
        withdrawal.currency === Currency.USDT
          ? this.exchangeRateService.usdtToInr(withdrawal.amount)
          : withdrawal.amount;

      if (withdrawal.businessId) {
        const withdrawer = await this.userModel.findById(withdrawal.userId).exec();
        const business = await this.businessModel
          .findById(withdrawal.businessId)
          .session(session || null);

        await this.businessService.creditP2pPayQuota(
          withdrawal.businessId.toString(),
          quotaInr,
          {
            referenceType:
              withdrawal.origin === 'business' ? 'business_withdrawal' : 'withdrawal',
            referenceId: withdrawal._id.toString(),
          },
        );
        await this.businessService.incrementStats(
          withdrawal.businessId.toString(),
          'totalDeposits',
          quotaInr,
        );

        if (withdrawal.origin !== 'business' && business) {
          await this.businessFloatService.creditFloatOnWithdrawalApprove(
            withdrawal.businessId.toString(),
            business.ownerId.toString(),
            withdrawal.amount,
            withdrawal.currency,
            withdrawal._id.toString(),
          );
        }

        const markedByBusiness = withdrawal.origin !== 'business' && !!business;
        await this.platformCommissionService.creditDepositGivenTo({
          amount: quotaInr,
          currency: Currency.INR,
          toUserId: withdrawal.userId.toString(),
          toName: withdrawer?.name || 'User',
          toRole: withdrawer?.role,
          fromName: markedByBusiness && business ? business.name : processedBy,
          fromRole: markedByBusiness ? UserRole.BUSINESS : UserRole.ADMIN,
          referenceType:
            withdrawal.origin === 'business' ? 'business_withdrawal' : 'withdrawal',
          referenceId: withdrawal._id.toString(),
          referenceLabel: withdrawal.referenceId,
          businessId: withdrawal.businessId.toString(),
          session: session || undefined,
        });
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
          session: session || undefined,
        });
      }

      return withdrawal;
    });
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

  /** Admin/sub-admin: only withdrawals without a business owner. */
  async approveAsAdmin(
    withdrawalId: string,
    dto: ProcessWithdrawalDto,
    processedBy: string,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId && withdrawal.origin !== 'business') {
      throw new ForbiddenException(
        'This withdrawal belongs to a business. Only that business can approve it.',
      );
    }
    return this.approve(withdrawalId, dto, processedBy);
  }

  async rejectAsAdmin(withdrawalId: string, dto: RejectWithdrawalDto) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId && withdrawal.origin !== 'business') {
      throw new ForbiddenException(
        'This withdrawal belongs to a business. Only that business can reject it.',
      );
    }
    return this.reject(withdrawalId, dto);
  }

  async reject(withdrawalId: string, dto: RejectWithdrawalDto) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.status !== TransactionStatus.PENDING && withdrawal.status !== TransactionStatus.PROCESSING) {
      throw new BadRequestException('Withdrawal cannot be rejected');
    }
    if ((withdrawal.paidAmount || 0) > 0) {
      throw new BadRequestException('Cannot reject withdrawal with approved payments');
    }
    const pendingPayments = await this.paymentModel.exists({
      withdrawalId: withdrawal._id,
      status: TransactionStatus.PENDING,
    });
    if (pendingPayments) {
      throw new BadRequestException('Reject pending split payments first');
    }

    await this.walletService.unlock(
      withdrawal.walletId.toString(),
      this.lockAmountFor(withdrawal),
    );
    await this.releasePartnerMirror(withdrawal);

    withdrawal.status = TransactionStatus.REJECTED;
    withdrawal.failureReason = dto.reason;
    await withdrawal.save();
    return withdrawal;
  }

  /**
   * Publish withdrawal to the P2P pay list (admin or owning business).
   * Distinct from final payout `approve`.
   */
  async listForP2p(
    withdrawalId: string,
    actor: { userId: string; email: string; role: UserRole },
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

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
      if (withdrawal.businessId?.toString() !== business._id.toString()) {
        throw new ForbiddenException('Withdrawal does not belong to your business');
      }
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

  /** Remove / reject from P2P pay list (admin or owning business). */
  async rejectP2pList(
    withdrawalId: string,
    actor: { userId: string; email: string; role: UserRole },
    reason?: string,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

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
      $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
    });
    if (pendingPays) {
      throw new BadRequestException(
        'Cannot unlist — active pending payments exist. Reject those first.',
      );
    }

    withdrawal.p2pListStatus = 'rejected';
    withdrawal.p2pListedAt = undefined;
    withdrawal.p2pListedBy = actor.email || actor.userId;
    withdrawal.p2pListRejectReason = reason?.trim() || 'Removed from P2P pay list';
    withdrawal.set('assignedTo', null);
    withdrawal.set('assignedBy', undefined);
    withdrawal.set('assignedAt', undefined);
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
    actor: { userId: string; email: string; role: UserRole },
  ) {
    if (!Types.ObjectId.isValid(assigneeId)) {
      throw new BadRequestException('Invalid assignee');
    }

    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

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
      if (withdrawal.businessId?.toString() !== business._id.toString()) {
        throw new ForbiddenException('Withdrawal does not belong to your business');
      }
      if (assignee.referredByBusiness?.toString() !== business._id.toString()) {
        throw new ForbiddenException('You can only assign to your own users');
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
    actor: { userId: string; email: string; role: UserRole },
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

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
      $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
    });
    if (pendingFromAssignee) {
      throw new BadRequestException(
        'Cannot unassign — assignee has a pending payment. Reject that proof first.',
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
    userId: string,
    dto: UpdateWithdrawalDestinationDto,
  ) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    await this.assertUserCanMutateDestination(withdrawal, userId, 'edit');

    await this.validateDestination({
      method: withdrawal.method,
      upiDetails: dto.upiDetails,
      bankDetails: dto.bankDetails,
      usdtDetails: dto.usdtDetails,
      cdmDetails: dto.cdmDetails,
    });

    if (withdrawal.method === PaymentMethod.UPI) {
      withdrawal.upiDetails = {
        upiId: dto.upiDetails?.upiId,
        payerName: dto.upiDetails!.payerName,
        qrImageKey: dto.upiDetails?.qrImageKey,
        qrImageUrl: dto.upiDetails?.qrImageUrl,
      };
      withdrawal.bankDetails = undefined;
      withdrawal.usdtDetails = undefined;
      withdrawal.cdmDetails = undefined;
    } else if (withdrawal.method === PaymentMethod.BANK) {
      withdrawal.bankDetails = {
        accountNumber: dto.bankDetails!.accountNumber,
        ifscCode: dto.bankDetails!.ifscCode,
        accountHolderName: dto.bankDetails!.accountHolderName,
        bankName: dto.bankDetails!.bankName,
      };
      withdrawal.upiDetails = undefined;
      withdrawal.usdtDetails = undefined;
      withdrawal.cdmDetails = undefined;
    } else if (withdrawal.method === PaymentMethod.CDM) {
      withdrawal.cdmDetails = {
        payerName: dto.cdmDetails!.payerName,
        locationHint: dto.cdmDetails?.locationHint,
        notes: dto.cdmDetails?.notes,
      };
      withdrawal.upiDetails = undefined;
      withdrawal.bankDetails = undefined;
      withdrawal.usdtDetails = undefined;
    } else {
      withdrawal.usdtDetails = {
        walletAddress: dto.usdtDetails!.walletAddress,
        network: dto.usdtDetails?.network || 'TRC20',
      };
      withdrawal.upiDetails = undefined;
      withdrawal.bankDetails = undefined;
      withdrawal.cdmDetails = undefined;
    }

    withdrawal.markModified('upiDetails');
    withdrawal.markModified('bankDetails');
    withdrawal.markModified('usdtDetails');
    withdrawal.markModified('cdmDetails');
    await withdrawal.save();
    return withdrawal;
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
      .populate('assignedTo', 'name email phone role businessUserCode')
      .exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId?.toString() !== businessId) {
      throw new ForbiddenException('Withdrawal does not belong to this business');
    }

    const tatMs = await this.platformSettingsService.getTatMs();
    const createdAt = (withdrawal as unknown as { createdAt?: Date }).createdAt;
    if (
      withdrawal.origin !== 'business' &&
      createdAt &&
      Date.now() - new Date(createdAt).getTime() < tatMs
    ) {
      throw new NotFoundException('Withdrawal not found');
    }

    const payments = await this.paymentModel
      .find({ withdrawalId: withdrawal._id })
      .sort({ createdAt: -1 })
      .exec();

    return {
      ...withdrawal.toObject(),
      remainingAmount: Math.max(0, withdrawal.amount - (withdrawal.paidAmount || 0)),
      readyForListApproval:
        !!createdAt && Date.now() - new Date(createdAt).getTime() >= tatMs,
      payments: payments.map((p) => this.toPaymentBrief(p)),
    };
  }

  async findByBusiness(businessId: string, opts: WithdrawalListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const bid = new Types.ObjectId(businessId);
    const tatMs = await this.platformSettingsService.getTatMs();
    const tatCutoff = tatCutoffDate(Date.now(), tatMs);

    const and: Record<string, unknown>[] = [
      { $or: [{ businessId: bid }, { businessId }] },
      // Hide from business during user cancel TAT (#24)
      businessWithdrawalVisibilityFilter(tatCutoff),
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
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.withdrawalModel
        .find(filter)
        .populate('userId', 'name email externalRef businessUserCode')
        .populate('assignedTo', 'name email phone role businessUserCode')
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
        return {
          ...w.toObject(),
          remainingAmount: Math.max(0, w.amount - (w.paidAmount || 0)),
          paymentCount: list.length,
          readyForListApproval:
            !!createdAt && Date.now() - new Date(createdAt).getTime() >= tatMs,
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
      notes: p.notes,
      disputedAt: p.disputedAt,
      disputeTicketId: p.disputeTicketId,
      payerUserId: p.payerUserId,
    };
  }

  async cancelForBusiness(businessId: string, referenceId: string) {
    const withdrawal = await this.findByReferenceForBusiness(businessId, referenceId);
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
    await this.walletService.unlock(
      withdrawal.walletId.toString(),
      this.lockAmountFor(withdrawal),
    );
    await this.releasePartnerMirror(withdrawal);
    withdrawal.status = TransactionStatus.CANCELLED;
    await withdrawal.save();
    this.p2pRealtime.emitListChanged('updated', {
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
        const userCanEdit = userCanCancel;
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

  async findPending(opts: WithdrawalListOpts = {}) {
    return this.findAll({
      ...opts,
      status: opts.status || TransactionStatus.PENDING,
    });
  }

  async findAll(opts: WithdrawalListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const tatMs = await this.platformSettingsService.getTatMs();
    const tatCutoff = tatCutoffDate(Date.now(), tatMs);
    const and: Record<string, unknown>[] = [
      // #24: Admin sees business withdrawals only after Platform Payment list approval
      adminWithdrawalVisibilityFilter(tatCutoff),
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
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
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

  async findByIdForAdmin(id: string) {
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

  private async validateDestination(dto: {
    method: PaymentMethod | string;
    upiDetails?: CreateWithdrawalDto['upiDetails'];
    bankDetails?: CreateWithdrawalDto['bankDetails'];
    usdtDetails?: CreateWithdrawalDto['usdtDetails'];
    cdmDetails?: CreateWithdrawalDto['cdmDetails'];
  }) {
    const settings = await this.platformSettingsService.get();
    assertValidWithdrawalDestination(dto, {
      allowMobileNumber: !!settings.allowMobileNumberUpi,
    });
  }
}
