import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Redemption, RedemptionDocument } from './schemas/redemption.schema';
import { Investment, InvestmentDocument } from './schemas/investment.schema';
import {
  CreateRedemptionDto,
  CreateInvestmentDto,
  ProcessRedemptionDto,
  RejectRedemptionDto,
} from './dto/investor.dto';
import { WalletService } from '../wallet/wallet.service';
import { CommissionService } from '../commission/commission.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  WithdrawalPayment,
  WithdrawalPaymentDocument,
} from '../withdrawal/schemas/withdrawal-payment.schema';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { LedgerType } from '../../common/enums/currency.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { withOptionalTransaction } from '../../common/utils/mongo-transaction';

export type InvestorListOpts = ListQueryOpts & { method?: string };

@Injectable()
export class InvestorService {
  constructor(
    @InjectModel(Redemption.name) private redemptionModel: Model<RedemptionDocument>,
    @InjectModel(Investment.name) private investmentModel: Model<InvestmentDocument>,
    @InjectModel(WithdrawalPayment.name)
    private paymentModel: Model<WithdrawalPaymentDocument>,
    @InjectConnection() private connection: Connection,
    private walletService: WalletService,
    private commissionService: CommissionService,
    private transactionService: TransactionService,
  ) {}

  async requestRedemption(investorId: string, dto: CreateRedemptionDto) {
    this.validateRedemptionDestination(dto);

    const redeemable = await this.walletService.getRedeemableAmount(investorId);

    if (dto.amount > redeemable) {
      throw new BadRequestException(
        `Redemption amount exceeds redeemable limit. Max: ${redeemable}`,
      );
    }

    const wallet = await this.walletService.getOrCreate(investorId);
    const referenceId = `RDM-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    await this.walletService.lock(wallet._id.toString(), dto.amount);

    return this.redemptionModel.create({
      referenceId,
      investorId,
      walletId: wallet._id,
      amount: dto.amount,
      maxRedeemable: redeemable,
      method: dto.method,
      upiDetails: dto.upiDetails,
      bankDetails: dto.bankDetails,
      usdtDetails: dto.usdtDetails,
      status: TransactionStatus.PENDING,
      note: dto.note,
    });
  }

  private validateRedemptionDestination(dto: CreateRedemptionDto) {
    switch (dto.method) {
      case PaymentMethod.UPI:
        if (!dto.upiDetails?.upiId) throw new BadRequestException('UPI ID required');
        break;
      case PaymentMethod.BANK:
        if (!dto.bankDetails?.accountNumber || !dto.bankDetails?.ifscCode) {
          throw new BadRequestException('Bank account and IFSC required');
        }
        break;
      case PaymentMethod.USDT:
        if (!dto.usdtDetails?.walletAddress) {
          throw new BadRequestException('USDT wallet address required');
        }
        break;
    }
  }

  async approve(redemptionId: string, dto: ProcessRedemptionDto, processedBy: string) {
    return withOptionalTransaction(this.connection, async (session) => {
      const redemption = await this.redemptionModel
        .findById(redemptionId)
        .session(session || null);
      if (!redemption) throw new NotFoundException('Redemption not found');
      if (redemption.status !== TransactionStatus.PENDING) {
        throw new BadRequestException('Redemption is not pending');
      }

      const walletId = redemption.walletId.toString();
      const investorId = redemption.investorId.toString();
      const wallet =
        (await this.walletService.findById(walletId, session || undefined)) ||
        (await this.walletService.getOrCreate(investorId));

      // Request already locked `amount`. getRedeemableAmount() excludes locked funds,
      // so re-checking it here wrongly rejects valid pending redemptions.
      if (wallet.balance < redemption.amount) {
        throw new BadRequestException('Insufficient wallet balance for redemption');
      }

      const commission = await this.commissionService.calculate(
        redemption.amount,
        CommissionTarget.INVESTOR,
        investorId,
        redemption.method,
      );
      const fee = Math.max(0, commission.amount || 0);
      const balanceBefore = wallet.balance;

      const lockRelease = Math.min(wallet.lockedBalance || 0, redemption.amount);
      if (lockRelease > 0) {
        await this.walletService.unlock(walletId, lockRelease, session || undefined);
      }

      let updatedWallet = await this.walletService.debit(
        walletId,
        redemption.amount,
        'totalRedeemed',
        session || undefined,
      );

      if (fee > 0) {
        const available =
          updatedWallet.balance - (updatedWallet.lockedBalance || 0);
        if (available < fee) {
          throw new BadRequestException(
            `Insufficient balance for redemption fee of ₹${fee}`,
          );
        }
        updatedWallet = await this.walletService.debit(
          walletId,
          fee,
          false,
          session || undefined,
        );
      }

      redemption.status = TransactionStatus.COMPLETED;
      redemption.processedBy = processedBy;
      redemption.completedAt = new Date();
      if (dto.note) redemption.note = dto.note;
      await redemption.save({ session: session || undefined });

      await this.transactionService.record({
        userId: investorId,
        walletId,
        type: LedgerType.REDEMPTION,
        amount: redemption.amount + fee,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        referenceType: 'redemption',
        referenceId: redemption._id.toString(),
        description:
          fee > 0
            ? `Investor redemption ₹${redemption.amount} + fee ₹${fee} by ${processedBy}`
            : `Investor redemption processed by ${processedBy}`,
      });

      return redemption;
    });
  }

  async reject(redemptionId: string, dto: RejectRedemptionDto) {
    const redemption = await this.redemptionModel.findById(redemptionId);
    if (!redemption) throw new NotFoundException('Redemption not found');
    if (redemption.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Redemption is not pending');
    }

    const walletId = redemption.walletId.toString();
    const wallet = await this.walletService.findById(walletId);
    const lockRelease = Math.min(wallet?.lockedBalance || 0, redemption.amount);
    if (lockRelease > 0) {
      await this.walletService.unlock(walletId, lockRelease);
    }
    redemption.status = TransactionStatus.REJECTED;
    redemption.failureReason = dto.reason;
    await redemption.save();
    return redemption;
  }

  async getRedeemableInfo(investorId: string) {
    const wallet = await this.walletService.getOrCreate(investorId);
    const redeemable = await this.walletService.getRedeemableAmount(investorId);
    // payerUserId may be ObjectId or legacy string in older rows
    const pendingRows = await this.paymentModel.aggregate<{ total: number }>([
      {
        $match: {
          status: TransactionStatus.PENDING,
          $or: [{ disputedAt: { $exists: false } }, { disputedAt: null }],
          $and: [
            {
              $or: [
                { payerUserId: new Types.ObjectId(investorId) },
                { payerUserId: investorId },
              ],
            },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const pendingInvestmentLocked = pendingRows[0]?.total || 0;
    return {
      totalDeposited: wallet.totalDeposited,
      totalInvested: wallet.totalInvested,
      totalRedeemed: wallet.totalRedeemed,
      redeemableAmount: redeemable,
      balance: wallet.balance,
      // Wallet locks (redemptions) + pending P2P pay investments awaiting verify / 24h
      lockedBalance: (wallet.lockedBalance || 0) + pendingInvestmentLocked,
      pendingInvestmentLocked,
    };
  }

  async requestInvestment(investorId: string, dto: CreateInvestmentDto) {
    const wallet = await this.walletService.getOrCreate(investorId);
    const referenceId = `INV-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    return this.investmentModel.create({
      referenceId,
      investorId,
      walletId: wallet._id,
      amount: dto.amount,
      method: dto.method,
      status: TransactionStatus.PENDING,
      note: dto.note,
    });
  }

  async approveInvestment(investmentId: string, processedBy: string, actorId?: string) {
    return withOptionalTransaction(this.connection, async (session) => {
      const investment = await this.investmentModel
        .findById(investmentId)
        .session(session || null);
      if (!investment) throw new NotFoundException('Investment not found');
      if (investment.status !== TransactionStatus.PENDING) {
        throw new BadRequestException('Investment is not pending');
      }

      const wallet = await this.walletService.getOrCreate(investment.investorId.toString());
      const balanceBefore = wallet.balance;

      const updatedWallet = await this.walletService.credit(
        wallet._id.toString(),
        investment.amount,
        'totalInvested',
        session || undefined,
      );

      investment.status = TransactionStatus.COMPLETED;
      investment.processedBy = processedBy;
      investment.completedAt = new Date();
      await investment.save({ session: session || undefined });

      await this.transactionService.record({
        userId: investment.investorId.toString(),
        walletId: wallet._id.toString(),
        type: LedgerType.INVESTMENT,
        amount: investment.amount,
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        referenceType: 'investment',
        referenceId: investment._id.toString(),
        description: `Investment approved by ${processedBy}`,
      });

      return investment;
    });
  }

  async rejectInvestment(investmentId: string, dto: RejectRedemptionDto) {
    const investment = await this.investmentModel.findById(investmentId);
    if (!investment) throw new NotFoundException('Investment not found');
    if (investment.status !== TransactionStatus.PENDING) {
      throw new BadRequestException('Investment is not pending');
    }
    investment.status = TransactionStatus.REJECTED;
    investment.failureReason = dto.reason;
    await investment.save();
    return investment;
  }

  private moneySort(sort?: string) {
    return listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { status: 1, createdAt: -1 },
    });
  }

  async findInvestmentsByInvestor(investorId: string, opts: InvestorListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [
      {
        $or: [
          { investorId: new Types.ObjectId(investorId) },
          { investorId },
        ],
      },
    ];

    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') and.push({ method: opts.method });
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { note: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = { $and: and };
    const [items, total] = await Promise.all([
      this.investmentModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort(this.moneySort(sort))
        .exec(),
      this.investmentModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findPendingInvestments(opts: InvestorListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts({
      ...opts,
      status: opts.status || TransactionStatus.PENDING,
    });
    const and: Record<string, unknown>[] = [];

    if (status) and.push({ status });
    if (opts.method && opts.method !== 'all') and.push({ method: opts.method });
    if (search) {
      const investorIds = await this.connection
        .collection('users')
        .find({
          $or: [
            { email: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ],
        })
        .project({ _id: 1 })
        .limit(50)
        .toArray();
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { note: { $regex: search, $options: 'i' } },
          ...(investorIds.length
            ? [{ investorId: { $in: investorIds.map((u) => u._id) } }]
            : []),
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};
    const [items, total] = await Promise.all([
      this.investmentModel
        .find(filter)
        .populate('investorId', 'name email phone')
        .skip(skip)
        .limit(limit)
        .sort(this.moneySort(sort))
        .exec(),
      this.investmentModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findByInvestor(investorId: string, opts: InvestorListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [
      {
        $or: [
          { investorId: new Types.ObjectId(investorId) },
          { investorId },
        ],
      },
    ];

    if (status) and.push({ status });
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { note: { $regex: search, $options: 'i' } },
          { failureReason: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = { $and: and };
    const [items, total] = await Promise.all([
      this.redemptionModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort(this.moneySort(sort))
        .exec(),
      this.redemptionModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findPending(opts: InvestorListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts({
      ...opts,
      status: opts.status || TransactionStatus.PENDING,
    });
    const and: Record<string, unknown>[] = [];

    if (status) and.push({ status });
    if (search) {
      const investorIds = await this.connection
        .collection('users')
        .find({
          $or: [
            { email: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ],
        })
        .project({ _id: 1 })
        .limit(50)
        .toArray();
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { note: { $regex: search, $options: 'i' } },
          { failureReason: { $regex: search, $options: 'i' } },
          ...(investorIds.length
            ? [{ investorId: { $in: investorIds.map((u) => u._id) } }]
            : []),
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};
    const [items, total] = await Promise.all([
      this.redemptionModel
        .find(filter)
        .populate('investorId', 'name email phone')
        .skip(skip)
        .limit(limit)
        .sort(this.moneySort(sort))
        .exec(),
      this.redemptionModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }
}
