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

    // Partner SSO users: spend Bitfarming earning wallet, mirror into FinGuard lock
    if (businessId && !isInvestor) {
      const business = await this.businessService.findDocumentById(businessId);
      if (this.partnerApiService.isConfigured(business)) {
        const partnerUserId = partnerUserIdFromExternalRef(user.externalRef);
        const partnerBal = await this.partnerApiService.fetchBalance(business, {
          email: user.email,
          userId: partnerUserId,
        });
        const partnerCurrency = (partnerBal.currency || 'INR').toUpperCase();

        // USDT balance → UPI/Bank INR payout needs conversion
        if (partnerCurrency === 'USDT' && !isUsdtMethod) {
          exchangeRate = this.exchangeRateService.getUsdtInrRate();
          sourceCurrency = Currency.USDT;
          sourceAmount = this.exchangeRateService.inrToUsdt(dto.amount);
          partnerDebitAmount = sourceAmount;
          currency = Currency.INR;
          payoutAmount = dto.amount;

          if (partnerBal.availableBalance < partnerDebitAmount) {
            throw new BadRequestException(
              `Insufficient USDT balance. Need ${partnerDebitAmount} USDT ` +
                `(₹${dto.amount} at ${exchangeRate} INR/USDT). ` +
                `Available ${partnerBal.availableBalance} USDT`,
            );
          }
        } else {
          sourceCurrency = partnerCurrency === 'USDT' ? Currency.USDT : Currency.INR;
          sourceAmount = dto.amount;
          partnerDebitAmount = dto.amount;
          if (partnerBal.availableBalance < partnerDebitAmount) {
            throw new BadRequestException(
              `Insufficient partner balance (available ${partnerBal.availableBalance} ${partnerBal.currency})`,
            );
          }
        }

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
    }

    const freshWallet = await this.walletService.getOrCreate(userId, walletCurrency, businessId);
    const available = freshWallet.balance - freshWallet.lockedBalance;
    if (available < lockAmount) {
      if (partnerDebited && businessId) {
        await this.refundPartnerDebit(user, businessId, partnerDebitAmount);
      }
      throw new BadRequestException('Insufficient balance');
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
      upiDetails: dto.upiDetails,
      bankDetails: dto.bankDetails,
      usdtDetails: dto.usdtDetails,
      partnerDebited,
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
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const withdrawal = await this.withdrawalModel.findById(withdrawalId).session(session);
      if (!withdrawal) throw new NotFoundException('Withdrawal not found');
      if (withdrawal.status !== TransactionStatus.PENDING) {
        throw new BadRequestException('Withdrawal is not pending');
      }
      if ((withdrawal.paidAmount || 0) > 0) {
        throw new BadRequestException('Cannot approve — use split payment approvals');
      }

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

      const totalDebit = withdrawal.amount + commissionAmount;
      const balanceBefore = wallet.balance;

      await this.walletService.unlock(wallet._id.toString(), withdrawal.amount, session);
      const updatedWallet = await this.walletService.debit(
        wallet._id.toString(),
        totalDebit,
        'totalWithdrawn',
        session,
      );

      if (dto.utr && withdrawal.upiDetails) withdrawal.upiDetails.utr = dto.utr;
      if (dto.utr && withdrawal.bankDetails) withdrawal.bankDetails.utr = dto.utr;
      if (dto.txHash && withdrawal.usdtDetails) withdrawal.usdtDetails.txHash = dto.txHash;

      withdrawal.status = TransactionStatus.COMPLETED;
      withdrawal.processedBy = processedBy;
      withdrawal.completedAt = new Date();
      await withdrawal.save({ session });

      await this.transactionService.record({
        userId: withdrawal.userId.toString(),
        walletId: wallet._id.toString(),
        type: LedgerType.WITHDRAWAL,
        amount: totalDebit,
        currency: withdrawal.currency,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        referenceType: 'withdrawal',
        referenceId: withdrawal._id.toString(),
        description: `Withdrawal processed by ${processedBy}`,
        businessId: withdrawal.businessId?.toString(),
      });

      if (withdrawal.businessId) {
        const business = await this.businessModel.findById(withdrawal.businessId).session(session);
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

      await session.commitTransaction();
      return withdrawal;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
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

  async cancel(withdrawalId: string, userId: string) {
    const withdrawal = await this.withdrawalModel.findById(withdrawalId);
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.userId.toString() !== userId) {
      throw new ForbiddenException('Not your withdrawal');
    }
    return this.cancelWithdrawalRecord(withdrawal);
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
      .populate('userId', 'name email phone externalRef')
      .exec();
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.businessId?.toString() !== businessId) {
      throw new ForbiddenException('Withdrawal does not belong to this business');
    }

    const payments = await this.paymentModel
      .find({ withdrawalId: withdrawal._id })
      .sort({ createdAt: -1 })
      .exec();

    return {
      ...withdrawal.toObject(),
      remainingAmount: Math.max(0, withdrawal.amount - (withdrawal.paidAmount || 0)),
      payments: payments.map((p) => this.toPaymentBrief(p)),
    };
  }

  async findByBusiness(businessId: string, opts: WithdrawalListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const bid = new Types.ObjectId(businessId);

    const and: Record<string, unknown>[] = [
      { $or: [{ businessId: bid }, { businessId }] },
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
        .populate('userId', 'name email phone externalRef')
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
        return {
          ...w.toObject(),
          remainingAmount: Math.max(0, w.amount - (w.paidAmount || 0)),
          paymentCount: list.length,
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

  /** Undo FinGuard mirror + refund Bitfarming when partner-funded withdrawal is cancelled/rejected */
  private async releasePartnerMirror(withdrawal: WithdrawalDocument) {
    if (!withdrawal.partnerDebited || !withdrawal.businessId) return;

    try {
      // Reverse mirror only — not a real withdrawal settlement
      await this.walletService.debit(withdrawal.walletId.toString(), withdrawal.amount, false);
    } catch {
      /* wallet may already be empty */
    }

    const user = await this.userModel.findById(withdrawal.userId).exec();
    if (!user) return;
    await this.refundPartnerDebit(
      user,
      withdrawal.businessId.toString(),
      withdrawal.sourceAmount ?? withdrawal.amount,
      `P2P withdrawal ${withdrawal.referenceId} cancelled — refund`,
    );
    withdrawal.partnerDebited = false;
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

    return {
      items: items.map((w) => {
        const list = byWithdrawal.get(w._id.toString()) || [];
        return {
          ...w.toObject(),
          remainingAmount: Math.max(0, w.amount - (w.paidAmount || 0)),
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
    const and: Record<string, unknown>[] = [];

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

  private validateDestination(dto: CreateWithdrawalDto) {
    switch (dto.method) {
      case PaymentMethod.UPI:
        if (!dto.upiDetails?.upiId) throw new BadRequestException('UPI destination required');
        break;
      case PaymentMethod.BANK:
        if (!dto.bankDetails?.accountNumber) throw new BadRequestException('Bank destination required');
        break;
      case PaymentMethod.USDT:
        if (!dto.usdtDetails?.walletAddress) throw new BadRequestException('USDT address required');
        break;
    }
  }
}
