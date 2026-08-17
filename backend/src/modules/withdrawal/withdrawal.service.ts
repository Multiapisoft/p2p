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
import { LedgerType, Currency } from '../../common/enums/currency.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UserRole } from '../../common/enums/role.enum';
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
  tatCutoffDate,
  userCanCancelWithdrawal,
} from './utils/withdrawal-visibility.util';
import { assertUniquePaymentRef } from './utils/payment-ref-uniqueness.util';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

export type WithdrawalListOpts = ListQueryOpts & { method?: string };

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
  ) {}

  async create(userId: string, dto: CreateWithdrawalDto) {
    this.validateDestination(dto);

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
    const businessId = user.referredByBusiness?.toString();
    const isInvestor = user.role === UserRole.INVESTOR;

    const isUsdtMethod = dto.method === PaymentMethod.USDT;
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

    // Partner SSO users: spend Bitfarming earning wallet when funded; otherwise any amount
    // for business-code users (P2P request) via FinGuard advance credit + lock.
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

      withdrawal.status = TransactionStatus.COMPLETED;
      withdrawal.processedBy = processedBy;
      withdrawal.completedAt = new Date();
      withdrawal.p2pAdvanceCredited = false;
      await withdrawal.save({ session: session || undefined });

      await this.transactionService.record({
        userId: withdrawal.userId.toString(),
        walletId: wallet._id.toString(),
        type: LedgerType.WITHDRAWAL,
        amount: lockAmt,
        currency: withdrawal.currency,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        referenceType: 'withdrawal',
        referenceId: withdrawal._id.toString(),
        description: `Withdrawal processed by ${processedBy}`,
        businessId: withdrawal.businessId?.toString(),
      });

      if (withdrawal.businessId) {
        const business = await this.businessModel
          .findById(withdrawal.businessId)
          .session(session || null);
        if (business) {
          await this.businessFloatService.creditFloatOnWithdrawalApprove(
            withdrawal.businessId.toString(),
            business.ownerId.toString(),
            withdrawal.amount,
            withdrawal.currency,
            withdrawal._id.toString(),
          );
        }
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
    if (withdrawal.businessId) {
      throw new ForbiddenException(
        'This withdrawal belongs to a business. Only that business can approve it.',
      );
    }
    return this.approve(withdrawalId, dto, processedBy);
  }

  async rejectAsAdmin(withdrawalId: string, dto: RejectWithdrawalDto) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId).exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId) {
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
      const business = await this.businessService.findByOwner(actor.userId);
      if (withdrawal.businessId?.toString() !== business._id.toString()) {
        throw new ForbiddenException('Withdrawal does not belong to your business');
      }
    } else if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.SUB_ADMIN) {
      throw new ForbiddenException('Not allowed to list withdrawals for P2P');
    }

    if (withdrawal.p2pListStatus === 'listed') {
      return withdrawal;
    }

    const tatMs = await this.platformSettingsService.getTatMs();
    const createdAt = (withdrawal as unknown as { createdAt?: Date }).createdAt;
    if (createdAt && Date.now() - new Date(createdAt).getTime() < tatMs) {
      const remainingSec = Math.ceil(
        (tatMs - (Date.now() - new Date(createdAt).getTime())) / 1000,
      );
      throw new BadRequestException(
        `User cancel window still active (${remainingSec}s remaining). Wait until TAT expires before listing for Platform Payment.`,
      );
    }

    withdrawal.p2pListStatus = 'listed';
    withdrawal.p2pListedAt = new Date();
    withdrawal.p2pListedBy = actor.email || actor.userId;
    withdrawal.p2pListRejectReason = undefined;
    await withdrawal.save();
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
      const business = await this.businessService.findByOwner(actor.userId);
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
    await withdrawal.save();
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

    this.validateDestination({
      method: withdrawal.method,
      upiDetails: dto.upiDetails,
      bankDetails: dto.bankDetails,
      usdtDetails: dto.usdtDetails,
    });

    if (withdrawal.method === PaymentMethod.UPI) {
      withdrawal.upiDetails = {
        upiId: dto.upiDetails!.upiId,
        payerName: dto.upiDetails!.payerName,
      };
      withdrawal.bankDetails = undefined;
      withdrawal.usdtDetails = undefined;
    } else if (withdrawal.method === PaymentMethod.BANK) {
      withdrawal.bankDetails = {
        accountNumber: dto.bankDetails!.accountNumber,
        ifscCode: dto.bankDetails!.ifscCode,
        accountHolderName: dto.bankDetails!.accountHolderName,
        bankName: dto.bankDetails!.bankName,
      };
      withdrawal.upiDetails = undefined;
      withdrawal.usdtDetails = undefined;
    } else {
      withdrawal.usdtDetails = {
        walletAddress: dto.usdtDetails!.walletAddress,
        network: dto.usdtDetails?.network || 'TRC20',
      };
      withdrawal.upiDetails = undefined;
      withdrawal.bankDetails = undefined;
    }

    withdrawal.markModified('upiDetails');
    withdrawal.markModified('bankDetails');
    withdrawal.markModified('usdtDetails');
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
      .populate('userId', 'name email phone externalRef businessUserCode')
      .exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId?.toString() !== businessId) {
      throw new ForbiddenException('Withdrawal does not belong to this business');
    }

    const tatMs = await this.platformSettingsService.getTatMs();
    const createdAt = (withdrawal as unknown as { createdAt?: Date }).createdAt;
    if (createdAt && Date.now() - new Date(createdAt).getTime() < tatMs) {
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
        .populate('userId', 'name email phone externalRef businessUserCode')
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
      this.withdrawalModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.withdrawalModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  private validateDestination(dto: {
    method: PaymentMethod | string;
    upiDetails?: CreateWithdrawalDto['upiDetails'];
    bankDetails?: CreateWithdrawalDto['bankDetails'];
    usdtDetails?: CreateWithdrawalDto['usdtDetails'];
  }) {
    assertValidWithdrawalDestination(dto);
  }
}
