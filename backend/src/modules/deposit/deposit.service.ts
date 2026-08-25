import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Deposit, DepositDocument } from './schemas/deposit.schema';
import { CreateDepositDto, ApproveDepositDto, RejectDepositDto } from './dto/deposit.dto';
import { WalletService } from '../wallet/wallet.service';
import { PlatformCommissionService } from '../wallet/platform-commission.service';
import { CommissionService } from '../commission/commission.service';
import { TransactionService } from '../transaction/transaction.service';
import { BusinessService } from '../business/business.service';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { LedgerType, Currency, UserStatus } from '../../common/enums/currency.enum';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { WebhookService } from '../webhook/webhook.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { PaymentConfigService } from '../payment-config/payment-config.service';
import { IntegrationRedirectService } from '../integration/integration-redirect.service';
import { BusinessFloatService } from '../integration/business-float.service';
import { ExchangeRateService } from '../wallet/exchange-rate.service';
import { Withdrawal, WithdrawalDocument } from '../withdrawal/schemas/withdrawal.schema';
import {
  WithdrawalPayment,
  WithdrawalPaymentDocument,
} from '../withdrawal/schemas/withdrawal-payment.schema';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { withOptionalTransaction } from '../../common/utils/mongo-transaction';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import {
  businessWithdrawalVisibilityFilter,
  tatCutoffDate,
} from '../withdrawal/utils/withdrawal-visibility.util';

export type DepositListOpts = ListQueryOpts & { method?: string };

type StatusAggRow = { _id: string; count: number; amount: number };

function emptyStatusMap() {
  return {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    rejected: 0,
  };
}

function foldStatusCounts(rows: StatusAggRow[]) {
  const counts = emptyStatusMap();
  let totalCount = 0;
  let completedAmount = 0;
  let pendingAmount = 0;
  for (const row of rows) {
    const key = row._id as keyof typeof counts;
    if (key in counts) counts[key] = row.count;
    totalCount += row.count;
    if (row._id === TransactionStatus.COMPLETED) completedAmount += row.amount;
    if (
      row._id === TransactionStatus.PENDING ||
      row._id === TransactionStatus.PROCESSING
    ) {
      pendingAmount += row.amount;
    }
  }
  return { counts, totalCount, completedAmount, pendingAmount };
}

@Injectable()
export class DepositService {
  constructor(
    @InjectModel(Deposit.name) private depositModel: Model<DepositDocument>,
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(WithdrawalPayment.name)
    private paymentModel: Model<WithdrawalPaymentDocument>,
    @InjectConnection() private connection: Connection,
    private walletService: WalletService,
    private commissionService: CommissionService,
    private transactionService: TransactionService,
    private businessService: BusinessService,
    private webhookService: WebhookService,
    private auditService: AuditService,
    private notificationService: NotificationService,
    private paymentConfigService: PaymentConfigService,
    private integrationRedirectService: IntegrationRedirectService,
    private businessFloatService: BusinessFloatService,
    private platformSettingsService: PlatformSettingsService,
    private platformCommissionService: PlatformCommissionService,
    private exchangeRateService: ExchangeRateService,
  ) {}

  async create(userId: string, dto: CreateDepositDto, businessFromApi?: BusinessDocument) {
    this.validatePaymentDetails(dto);

    const paymentConfig = await this.paymentConfigService.findByMethod(
      dto.method,
      dto.method === PaymentMethod.USDT ? Currency.USDT : dto.currency || Currency.INR,
    );
    this.paymentConfigService.validateAmount(paymentConfig, dto.amount);
    if (dto.method !== PaymentMethod.USDT) {
      const minAmt = await this.platformSettingsService.getMinTransactionAmount();
      if (dto.amount < minAmt) {
        throw new BadRequestException(`Minimum deposit is ₹${minAmt}`);
      }
    }

    let businessId: string | undefined;
    if (dto.integrationToken) {
      const session = await this.integrationRedirectService.findValidSession(dto.integrationToken);
      if (session.userId.toString() !== userId) {
        throw new ForbiddenException('Integration session does not match user');
      }
      if (session.amount !== dto.amount) {
        throw new BadRequestException(`Amount must be ${session.amount} as per integration session`);
      }
      businessId = session.businessId.toString();
    } else if (businessFromApi) {
      businessId = businessFromApi._id.toString();
      if (!businessFromApi.allowedPaymentMethods.includes(dto.method)) {
        throw new BadRequestException('Payment method not allowed for this business');
      }
      const user = await this.userModel.findById(userId).exec();
      if (!user) throw new NotFoundException('User not found');
      if (user.referredByBusiness?.toString() !== businessId) {
        throw new ForbiddenException('User does not belong to this business');
      }
    } else if (dto.referralCode) {
      const business = await this.businessModel
        .findOne({ referralCode: dto.referralCode })
        .exec();
      if (business) businessId = business._id.toString();
    } else {
      const user = await this.userModel.findById(userId).exec();
      businessId = await this.businessService.findBusinessIdForUser(user);
    }

    if (businessId) {
      await this.businessService.assertDepositsEnabled(businessId);
    }

    const currency =
      dto.method === PaymentMethod.USDT ? Currency.USDT : dto.currency || Currency.INR;
    const wallet = await this.walletService.getOrCreate(userId, currency, businessId);

    const referenceId = `DEP-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    let businessFloatLock: Record<string, unknown> | undefined;
    if (businessId) {
      const floatInfo = await this.businessFloatService.lockFloatForDeposit(
        businessId,
        dto.amount,
        currency,
      );
      if (floatInfo) {
        businessFloatLock = floatInfo as unknown as Record<string, unknown>;
      }
    }

    const deposit = await this.depositModel.create({
      referenceId,
      userId,
      businessId,
      walletId: wallet._id,
      amount: dto.amount,
      currency,
      method: dto.method,
      status: TransactionStatus.PENDING,
      upiDetails: dto.upiDetails,
      bankDetails: dto.bankDetails,
      usdtDetails: dto.usdtDetails,
      cdmDetails: dto.cdmDetails,
      externalRef: dto.externalRef,
      metadata: businessFloatLock ? { businessFloatLock } : undefined,
    });

    await this.notificationService.send(
      userId,
      'Deposit Initiated',
      `Your deposit of ${dto.amount} ${currency} is pending approval`,
      'deposit',
      'deposit',
      deposit._id.toString(),
    );

    if (businessId) {
      await this.webhookService.dispatch(businessId, 'deposit.created', {
        referenceId: deposit.referenceId,
        userId,
        amount: dto.amount,
        method: dto.method,
        status: deposit.status,
        externalRef: dto.externalRef,
      });
    }

    if (dto.integrationToken) {
      await this.integrationRedirectService.consumeSession(
        dto.integrationToken,
        userId,
        deposit._id.toString(),
        deposit.referenceId,
      );
    }

    return deposit;
  }

  async approve(depositId: string, dto: ApproveDepositDto, approvedBy: string, actorId?: string) {
    const deposit = await withOptionalTransaction(this.connection, async (session) => {
      const doc = await this.depositModel.findById(depositId).session(session || null);
      if (!doc) throw new NotFoundException('Deposit not found');
      if (doc.status !== TransactionStatus.PENDING) {
        throw new BadRequestException('Deposit is not pending');
      }

      if (dto.utr && doc.upiDetails) doc.upiDetails.utr = dto.utr;
      if (dto.utr && doc.bankDetails) doc.bankDetails.utr = dto.utr;
      if (dto.txHash && doc.usdtDetails) doc.usdtDetails.txHash = dto.txHash;

      const wallet = await this.walletService.getOrCreate(
        doc.userId.toString(),
        doc.currency,
      );
      const balanceBefore = wallet.balance;

      let businessCommission = 0;
      let platformCommission = 0;

      let bizId = doc.businessId?.toString();
      if (!bizId) {
        const depositor = await this.userModel.findById(doc.userId).exec();
        bizId = await this.businessService.findBusinessIdForUser(depositor);
        if (bizId) {
          doc.businessId = new Types.ObjectId(bizId);
        }
      }

      if (bizId) {
        const commission = await this.commissionService.calculate(
          doc.amount,
          CommissionTarget.BUSINESS,
          bizId,
          doc.method,
          'deposit',
        );
        businessCommission = commission.amount;
        doc.commissionAmount = businessCommission;
        doc.commissionPaidTo = doc.businessId;

        await this.businessService.incrementStats(
          bizId,
          'totalDeposits',
          doc.amount,
        );
        await this.businessService.creditP2pPayQuota(
          bizId,
          this.quotaAmountInr(doc.amount, doc.currency),
          { referenceType: 'deposit', referenceId: doc._id.toString() },
        );
        if (businessCommission > 0) {
          await this.businessService.incrementStats(
            bizId,
            'totalCommissionEarned',
            businessCommission,
          );
        }
      }

      const platformFee = await this.commissionService.calculate(
        doc.amount,
        CommissionTarget.PLATFORM,
        doc.businessId?.toString(),
        doc.method,
        'deposit',
      );
      platformCommission = platformFee.amount;

      const totalCommission = businessCommission + platformCommission;
      // End-user gets full deposit; fees are collected to admin wallet, not user wallet.
      const netAmount = doc.amount;

      const updatedWallet = await this.walletService.credit(
        wallet._id.toString(),
        netAmount,
        'totalDeposited',
        session || undefined,
      );

      doc.status = TransactionStatus.COMPLETED;
      doc.completedAt = new Date();
      doc.commissionAmount = totalCommission;
      await doc.save({ session: session || undefined });

      const floatLock = doc.metadata?.businessFloatLock as
        | { ownerWalletId: string; ownerId: string; amount: number }
        | undefined;
      if (floatLock && doc.businessId) {
        await this.businessFloatService.debitFloatOnDepositApprove(
          doc.businessId.toString(),
          floatLock.ownerWalletId,
          floatLock.amount,
          doc.currency,
          doc._id.toString(),
          floatLock.ownerId,
        );
      }

      await this.transactionService.record({
        userId: doc.userId.toString(),
        walletId: wallet._id.toString(),
        type: LedgerType.DEPOSIT,
        amount: netAmount,
        currency: doc.currency,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        referenceType: 'deposit',
        referenceId: doc._id.toString(),
        description: `Deposit approved by ${approvedBy}`,
        businessId: doc.businessId?.toString(),
      });

      if (platformCommission > 0 || businessCommission > 0) {
        const depositor = await this.userModel.findById(doc.userId).exec();
        await this.platformCommissionService.creditCollectedFees({
          platformAmount: platformCommission,
          businessAmount: businessCommission,
          currency: doc.currency,
          fromUserId: doc.userId.toString(),
          fromName: depositor?.name || 'Depositor',
          fromRole: depositor?.role,
          referenceType: 'deposit',
          referenceId: doc._id.toString(),
          referenceLabel: doc.referenceId,
          businessId: doc.businessId?.toString(),
          session: session || undefined,
        });
      }

      return { deposit: doc, netAmount, totalCommission };
    });

    const { deposit: approved, netAmount, totalCommission } = deposit;

    // Side-effects after DB commit — never roll back money ops if these fail
    try {
      await this.notificationService.send(
        approved.userId.toString(),
        'Deposit Approved',
        `Your deposit of ${approved.amount} ${approved.currency} has been approved`,
        'success',
        'deposit',
        approved._id.toString(),
      );
    } catch {
      /* non-fatal */
    }

    if (approved.businessId) {
      try {
        await this.webhookService.dispatch(approved.businessId.toString(), 'deposit.approved', {
          referenceId: approved.referenceId,
          amount: approved.amount,
          netAmount,
          commission: totalCommission,
          status: approved.status,
        });
      } catch {
        /* non-fatal */
      }
    }

    try {
      await this.auditService.log({
        actorId,
        actorEmail: approvedBy,
        action: 'deposit.approve',
        resource: 'deposit',
        resourceId: approved._id.toString(),
        metadata: { amount: approved.amount, netAmount },
      });
    } catch {
      /* non-fatal */
    }

    return approved;
  }

  async reject(depositId: string, dto: RejectDepositDto, rejectedBy?: string, actorId?: string) {
    const deposit = await this.depositModel
      .findByIdAndUpdate(
        depositId,
        { status: TransactionStatus.REJECTED, failureReason: dto.reason },
        { new: true },
      )
      .exec();
    if (!deposit) throw new NotFoundException('Deposit not found');

    await this.releaseDepositFloatLock(deposit);

    await this.notificationService.send(
      deposit.userId.toString(),
      'Deposit Rejected',
      `Your deposit was rejected: ${dto.reason}`,
      'error',
      'deposit',
      deposit._id.toString(),
    );

    if (deposit.businessId) {
      await this.webhookService.dispatch(deposit.businessId.toString(), 'deposit.rejected', {
        referenceId: deposit.referenceId,
        reason: dto.reason,
      });
    }

    if (rejectedBy) {
      await this.auditService.log({
        actorId,
        actorEmail: rejectedBy,
        action: 'deposit.reject',
        resource: 'deposit',
        resourceId: depositId,
        metadata: { reason: dto.reason },
      });
    }

    return deposit;
  }

  async cancel(depositId: string, userId: string) {
    const deposit = await this.depositModel.findById(depositId).exec();
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.userId.toString() !== userId) {
      throw new ForbiddenException('Not your deposit');
    }
    return this.cancelDepositRecord(deposit);
  }

  async cancelForBusiness(businessId: string, referenceId: string) {
    const deposit = await this.findByReferenceForBusiness(businessId, referenceId);
    return this.cancelDepositRecord(deposit);
  }

  private async cancelDepositRecord(deposit: DepositDocument) {
    if (deposit.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Only pending deposits can be cancelled');
    }

    deposit.status = TransactionStatus.CANCELLED;
    await deposit.save();

    await this.releaseDepositFloatLock(deposit);

    if (deposit.businessId) {
      await this.webhookService.dispatch(deposit.businessId.toString(), 'deposit.cancelled', {
        referenceId: deposit.referenceId,
      });
    }

    return deposit;
  }

  async findById(id: string, userId?: string) {
    const q = this.depositModel.findById(id);
    if (!userId) {
      q.populate('userId', 'name email phone role status businessUserCode externalRef')
        .populate('businessId', 'name slug status referralCode')
        .populate('commissionPaidTo', 'name email role');
    }
    const deposit = await q.exec();
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (userId && deposit.userId.toString() !== userId) {
      throw new ForbiddenException('Not your deposit');
    }
    return deposit;
  }

  async findByIdForBusiness(id: string, businessId: string) {
    const deposit = await this.depositModel
      .findById(id)
      .populate('userId', 'name email externalRef')
      .exec();
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.businessId?.toString() !== businessId) {
      throw new ForbiddenException('Deposit does not belong to this business');
    }
    return deposit;
  }

  async findByReferenceForBusiness(businessId: string, referenceId: string) {
    const deposit = await this.depositModel
      .findOne({ referenceId, businessId: new Types.ObjectId(businessId) })
      .exec();
    if (!deposit) throw new NotFoundException('Deposit not found');
    return deposit;
  }

  private depositSort(sort?: string) {
    return listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
    });
  }

  private buildDepositFilter(
    base: Record<string, unknown>,
    opts: DepositListOpts,
  ): Record<string, unknown> {
    const { search, status } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [base];

    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') {
      and.push({ method: opts.method });
    }
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { externalRef: { $regex: search, $options: 'i' } },
          { 'upiDetails.upiId': { $regex: search, $options: 'i' } },
          { 'bankDetails.accountNumber': { $regex: search, $options: 'i' } },
          { 'bankDetails.accountHolderName': { $regex: search, $options: 'i' } },
          { 'usdtDetails.walletAddress': { $regex: search, $options: 'i' } },
        ],
      });
    }

    return and.length === 1 ? base : { $and: and };
  }

  private async queryDeposits(
    base: Record<string, unknown>,
    opts: DepositListOpts = {},
    populateUser: false | 'public' | 'admin' = false,
  ) {
    const { page, limit, skip, sort } = normalizeListOpts(opts);
    const filter = this.buildDepositFilter(base, opts);
    const sortSpec = this.depositSort(sort);

    let q = this.depositModel.find(filter).skip(skip).limit(limit).sort(sortSpec);
    if (populateUser === 'admin') {
      q = q
        .populate('userId', 'name email phone role status businessUserCode externalRef')
        .populate('businessId', 'name slug status referralCode')
        .populate('commissionPaidTo', 'name email role');
    } else if (populateUser === 'public') {
      q = q
        .populate('userId', 'name email externalRef')
        .populate('businessId', 'name slug');
    }

    const [items, total] = await Promise.all([
      q.exec(),
      this.depositModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findByUser(userId: string, opts: DepositListOpts = {}) {
    const result = await this.queryDeposits(
      { $or: [{ userId: new Types.ObjectId(userId) }, { userId }] },
      opts,
    );
    // User must not see platform/business fee cuts on their deposits.
    return {
      ...result,
      items: result.items.map((d) => {
        const obj = d.toObject() as unknown as Record<string, unknown>;
        const {
          commissionAmount: _c,
          commissionPaidTo: _p,
          ...rest
        } = obj as {
          commissionAmount?: unknown;
          commissionPaidTo?: unknown;
        } & Record<string, unknown>;
        return rest;
      }),
    };
  }

  async findByBusiness(businessId: string, opts: DepositListOpts = {}) {
    return this.queryDeposits(
      {
        $or: [
          { businessId: new Types.ObjectId(businessId) },
          { businessId },
        ],
      },
      opts,
      'public',
    );
  }

  async findPending(opts: DepositListOpts = {}) {
    return this.queryDeposits(
      {},
      { ...opts, status: opts.status || TransactionStatus.PENDING },
      'admin',
    );
  }

  async findAll(opts: DepositListOpts = {}) {
    return this.queryDeposits({}, opts, 'admin');
  }

  async getMethodSummary(status?: TransactionStatus) {
    const match: Record<string, unknown> = {};
    if (status) match.status = status;
    const rows = await this.depositModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$method',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);
    const byMethod: Record<string, { totalAmount: number; count: number }> = {};
    let totalAmount = 0;
    let totalCount = 0;
    for (const r of rows) {
      byMethod[r._id] = { totalAmount: r.totalAmount, count: r.count };
      totalAmount += r.totalAmount;
      totalCount += r.count;
    }
    return { byMethod, totalAmount, totalCount };
  }

  async getBusinessDepositSummary(businessId: string) {
    const result = await this.depositModel.aggregate([
      {
        $match: {
          businessId: new Types.ObjectId(businessId),
          status: TransactionStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: '$userId',
          totalDeposited: { $sum: '$amount' },
          depositCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          userId: '$_id',
          userName: '$user.name',
          userEmail: '$user.email',
          totalDeposited: 1,
          depositCount: 1,
        },
      },
    ]);
    return result;
  }

  async getBusinessOverview(businessId: string) {
    const bid = new Types.ObjectId(businessId);
    const business = await this.businessModel.findById(bid).exec();
    if (!business) throw new NotFoundException('Business not found');

    // Match ObjectId or legacy string businessId (same as list endpoints)
    const bizMatch = { $or: [{ businessId: bid }, { businessId }] };
    const tatMs = await this.platformSettingsService.getTatMs();
    const tatCutoff = tatCutoffDate(Date.now(), tatMs);

    const [
      totalUsers,
      activeUsers,
      depositStatusRows,
      withdrawalStatusRows,
      pendingVisibleWithdrawals,
      awaitingListCount,
      listedCount,
      paymentStatusRows,
      inboundPayCompleted,
      outboundPayCompleted,
    ] = await Promise.all([
      this.userModel.countDocuments({ referredByBusiness: bid }).exec(),
      this.userModel
        .countDocuments({ referredByBusiness: bid, status: UserStatus.ACTIVE })
        .exec(),
      this.depositModel
        .aggregate<StatusAggRow>([
          { $match: bizMatch },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
      this.withdrawalModel
        .aggregate<StatusAggRow>([
          { $match: bizMatch },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
      // Matches what business sees on Withdrawals page (after TAT)
      this.withdrawalModel
        .countDocuments({
          $and: [
            bizMatch,
            businessWithdrawalVisibilityFilter(tatCutoff),
            {
              status: {
                $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
              },
            },
          ],
        })
        .exec(),
      this.withdrawalModel
        .countDocuments({
          $and: [
            bizMatch,
            businessWithdrawalVisibilityFilter(tatCutoff),
            {
              status: {
                $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
              },
            },
            {
              $or: [
                { p2pListStatus: { $exists: false } },
                { p2pListStatus: null },
                { p2pListStatus: 'awaiting' },
              ],
            },
          ],
        })
        .exec(),
      this.withdrawalModel
        .countDocuments({
          $and: [bizMatch, { p2pListStatus: 'listed' }],
        })
        .exec(),
      this.paymentModel
        .aggregate<StatusAggRow>([
          {
            $match: {
              $or: [
                { businessId: bid },
                { businessId },
                { payerBusinessId: bid },
                { payerBusinessId: businessId },
              ],
            },
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
      this.paymentModel
        .aggregate<{ count: number; amount: number }>([
          {
            $match: {
              $or: [{ businessId: bid }, { businessId }],
              status: TransactionStatus.COMPLETED,
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
        .aggregate<{ count: number; amount: number }>([
          {
            $match: {
              $or: [{ payerBusinessId: bid }, { payerBusinessId: businessId }],
              status: TransactionStatus.COMPLETED,
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
    ]);

    const deposits = foldStatusCounts(depositStatusRows);
    const withdrawals = foldStatusCounts(withdrawalStatusRows);
    const payments = foldStatusCounts(paymentStatusRows);
    const inbound = inboundPayCompleted[0];
    const outbound = outboundPayCompleted[0];

    const limit = business.p2pPayLimit || 0;
    const earned = business.p2pPayEarned || 0;
    const used = business.p2pPayUsed || 0;

    return {
      totalUsers,
      activeUsers,
      depositCount: deposits.totalCount,
      completedDeposits: deposits.counts.completed,
      pendingDeposits: deposits.counts.pending + deposits.counts.processing,
      failedDeposits: deposits.counts.failed,
      cancelledDeposits: deposits.counts.cancelled,
      rejectedDeposits: deposits.counts.rejected,
      totalDepositAmount: deposits.completedAmount,
      pendingDepositAmount: deposits.pendingAmount,
      depositStatusCounts: deposits.counts,

      withdrawalCount: withdrawals.totalCount,
      completedWithdrawals: withdrawals.counts.completed,
      // Attention count = visible to business (post-TAT), matches Withdrawals page
      pendingWithdrawals: pendingVisibleWithdrawals,
      pendingWithdrawalsAll:
        withdrawals.counts.pending + withdrawals.counts.processing,
      failedWithdrawals: withdrawals.counts.failed,
      cancelledWithdrawals: withdrawals.counts.cancelled,
      rejectedWithdrawals: withdrawals.counts.rejected,
      totalWithdrawals: withdrawals.completedAmount,
      pendingWithdrawalAmount: withdrawals.pendingAmount,
      withdrawalStatusCounts: withdrawals.counts,
      awaitingListCount,
      listedCount,

      platformPaymentCount: payments.totalCount,
      pendingPlatformPayments: payments.counts.pending + payments.counts.processing,
      completedPlatformPayments: payments.counts.completed,
      platformPaymentStatusCounts: payments.counts,
      inboundPlatformPayments: inbound?.count ?? 0,
      inboundPlatformPaymentAmount: inbound?.amount ?? 0,
      outboundPlatformPayments: outbound?.count ?? 0,
      outboundPlatformPaymentAmount: outbound?.amount ?? 0,

      totalCommissionEarned: business.totalCommissionEarned ?? 0,
      commissionRate: business.commissionRate ?? 0,
      p2pPayLimit: limit,
      p2pPayEarned: earned,
      p2pPayUsed: used,
      p2pPayRemaining: await this.businessService.getP2pPayRemaining(businessId),
      ...this.businessService.highlightSnapshot(business),
      businessName: business.name,
      businessStatus: business.status,
    };
  }

  private quotaAmountInr(amount: number, currency?: string) {
    if ((currency || '').toUpperCase() === 'USDT') {
      return this.exchangeRateService.usdtToInr(amount);
    }
    return amount;
  }

  private async releaseDepositFloatLock(deposit: DepositDocument) {
    const floatLock = deposit.metadata?.businessFloatLock as
      | { ownerWalletId: string; amount: number }
      | undefined;
    if (floatLock?.ownerWalletId && floatLock.amount) {
      await this.businessFloatService.releaseFloatLock(floatLock.ownerWalletId, floatLock.amount);
    }
  }

  private validatePaymentDetails(dto: CreateDepositDto) {
    switch (dto.method) {
      case PaymentMethod.UPI:
        if (!dto.upiDetails?.upiId) {
          throw new BadRequestException('UPI details required');
        }
        break;
      case PaymentMethod.BANK:
        if (!dto.bankDetails?.accountNumber || !dto.bankDetails?.ifscCode) {
          throw new BadRequestException('Bank details required');
        }
        break;
      case PaymentMethod.USDT:
        if (!dto.usdtDetails?.walletAddress) {
          throw new BadRequestException('USDT wallet address required');
        }
        break;
      case PaymentMethod.CDM:
        if (!dto.cdmDetails?.payerName?.trim()) {
          throw new BadRequestException('CDM depositor name required');
        }
        break;
      default: {
        const _exhaustive: never = dto.method;
        void _exhaustive;
        throw new BadRequestException('Unsupported payment method');
      }
    }
  }
}
