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
import { CommissionService } from '../commission/commission.service';
import { TransactionService } from '../transaction/transaction.service';
import { BusinessService } from '../business/business.service';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { LedgerType, Currency } from '../../common/enums/currency.enum';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { WebhookService } from '../webhook/webhook.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { PaymentConfigService } from '../payment-config/payment-config.service';
import { IntegrationRedirectService } from '../integration/integration-redirect.service';
import { BusinessFloatService } from '../integration/business-float.service';
import { Withdrawal, WithdrawalDocument } from '../withdrawal/schemas/withdrawal.schema';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { withOptionalTransaction } from '../../common/utils/mongo-transaction';

export type DepositListOpts = ListQueryOpts & { method?: string };

@Injectable()
export class DepositService {
  constructor(
    @InjectModel(Deposit.name) private depositModel: Model<DepositDocument>,
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
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
  ) {}

  async create(userId: string, dto: CreateDepositDto, businessFromApi?: BusinessDocument) {
    this.validatePaymentDetails(dto);

    const paymentConfig = await this.paymentConfigService.findByMethod(
      dto.method,
      dto.method === PaymentMethod.USDT ? Currency.USDT : dto.currency || Currency.INR,
    );
    this.paymentConfigService.validateAmount(paymentConfig, dto.amount);

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
      if (user?.referredByBusiness) {
        businessId = user.referredByBusiness.toString();
      }
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

      if (doc.businessId) {
        const commission = await this.commissionService.calculate(
          doc.amount,
          CommissionTarget.BUSINESS,
          doc.businessId.toString(),
          doc.method,
        );
        businessCommission = commission.amount;
        doc.commissionAmount = businessCommission;
        doc.commissionPaidTo = doc.businessId;

        await this.businessService.incrementStats(
          doc.businessId.toString(),
          'totalDeposits',
          doc.amount,
        );
        if (businessCommission > 0) {
          await this.businessService.incrementStats(
            doc.businessId.toString(),
            'totalCommissionEarned',
            businessCommission,
          );
        }
      }

      const platformFee = await this.commissionService.calculate(
        doc.amount,
        CommissionTarget.PLATFORM,
        undefined,
        doc.method,
      );
      platformCommission = platformFee.amount;

      const totalCommission = businessCommission + platformCommission;
      const netAmount = doc.amount - totalCommission;

      const updatedWallet = await this.walletService.credit(
        wallet._id.toString(),
        netAmount,
        'totalDeposited',
        session || undefined,
      );

      doc.status = TransactionStatus.COMPLETED;
      doc.completedAt = new Date();
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

      if (totalCommission > 0) {
        await this.transactionService.record({
          userId: doc.userId.toString(),
          walletId: wallet._id.toString(),
          type: LedgerType.COMMISSION,
          amount: totalCommission,
          currency: doc.currency,
          balanceBefore: updatedWallet.balance,
          balanceAfter: updatedWallet.balance,
          referenceType: 'deposit',
          referenceId: doc._id.toString(),
          description: `Commission on deposit (business: ${businessCommission}, platform: ${platformCommission})`,
          businessId: doc.businessId?.toString(),
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
    const deposit = await this.depositModel.findById(id).exec();
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (userId && deposit.userId.toString() !== userId) {
      throw new ForbiddenException('Not your deposit');
    }
    return deposit;
  }

  async findByIdForBusiness(id: string, businessId: string) {
    const deposit = await this.depositModel
      .findById(id)
      .populate('userId', 'name email phone externalRef')
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
    populateUser = false,
  ) {
    const { page, limit, skip, sort } = normalizeListOpts(opts);
    const filter = this.buildDepositFilter(base, opts);
    const sortSpec = this.depositSort(sort);

    let q = this.depositModel.find(filter).skip(skip).limit(limit).sort(sortSpec);
    if (populateUser) {
      q = q.populate('userId', 'name email phone externalRef');
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
    return this.queryDeposits(
      { $or: [{ userId: new Types.ObjectId(userId) }, { userId }] },
      opts,
    );
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
      true,
    );
  }

  async findPending(opts: DepositListOpts = {}) {
    return this.queryDeposits(
      {},
      { ...opts, status: opts.status || TransactionStatus.PENDING },
      true,
    );
  }

  async findAll(opts: DepositListOpts = {}) {
    return this.queryDeposits({}, opts, true);
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

    const [totalUsers, depositStats, withdrawalStats] = await Promise.all([
      this.userModel.countDocuments({ referredByBusiness: bid }).exec(),
      this.depositModel.aggregate([
        { $match: { businessId: bid } },
        {
          $group: {
            _id: null,
            depositCount: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', TransactionStatus.COMPLETED] }, 1, 0] },
            },
            pendingCount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            completedAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', TransactionStatus.COMPLETED] }, '$amount', 0],
              },
            },
          },
        },
      ]),
      this.withdrawalModel.aggregate([
        { $match: { businessId: bid } },
        {
          $group: {
            _id: null,
            withdrawalCount: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', TransactionStatus.COMPLETED] }, 1, 0] },
            },
            pendingCount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      '$status',
                      [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            completedAmount: {
              $sum: {
                $cond: [{ $eq: ['$status', TransactionStatus.COMPLETED] }, '$amount', 0],
              },
            },
          },
        },
      ]),
    ]);

    const agg = depositStats[0] as
      | {
          depositCount: number;
          completedCount: number;
          pendingCount: number;
          completedAmount: number;
        }
      | undefined;

    const wAgg = withdrawalStats[0] as
      | {
          withdrawalCount: number;
          completedCount: number;
          pendingCount: number;
          completedAmount: number;
        }
      | undefined;

    return {
      totalUsers,
      depositCount: agg?.depositCount ?? 0,
      completedDeposits: agg?.completedCount ?? 0,
      pendingDeposits: agg?.pendingCount ?? 0,
      totalDepositAmount: agg?.completedAmount ?? 0,
      withdrawalCount: wAgg?.withdrawalCount ?? 0,
      completedWithdrawals: wAgg?.completedCount ?? 0,
      pendingWithdrawals: wAgg?.pendingCount ?? 0,
      totalWithdrawals: wAgg?.completedAmount ?? business.totalWithdrawals ?? 0,
      totalCommissionEarned: business.totalCommissionEarned,
      commissionRate: business.commissionRate,
      businessName: business.name,
      businessStatus: business.status,
    };
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
    }
  }
}
