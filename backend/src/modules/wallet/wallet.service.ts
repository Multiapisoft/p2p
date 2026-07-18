import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { Currency, LedgerType } from '../../common/enums/currency.enum';
import { RedisService } from '../../redis/redis.service';
import { TransactionService } from '../transaction/transaction.service';
import { WalletAdjustType } from './dto/wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    private redis: RedisService,
    private transactionService: TransactionService,
  ) {}

  async getOrCreate(userId: string, currency = Currency.INR, businessId?: string) {
    let wallet = await this.walletModel
      .findOne({ userId, currency })
      .exec();

    if (!wallet) {
      wallet = await this.walletModel.create({
        userId,
        currency,
        businessId,
      });
    }
    return wallet;
  }

  async findByUser(userId: string) {
    const cacheKey = `wallet:user:${userId}`;
    const cached = await this.redis.get<WalletDocument[]>(cacheKey);
    if (cached) return cached;

    const wallets = await this.walletModel.find({ userId }).exec();
    await this.redis.set(cacheKey, wallets.map((w) => w.toObject()), 60);
    return wallets;
  }

  async credit(
    walletId: string,
    amount: number,
    /** Pass `false` for internal mirror moves that must not inflate lifetime stats. */
    field: 'totalDeposited' | 'totalInvested' | false = 'totalDeposited',
    session?: ClientSession,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const $inc: Record<string, number> = { balance: amount };
    if (field) $inc[field] = amount;

    const wallet = await this.walletModel
      .findByIdAndUpdate(walletId, { $inc }, { new: true, session })
      .exec();
    if (!wallet) throw new NotFoundException('Wallet not found');
    await this.invalidateCache(wallet.userId.toString());
    return wallet;
  }

  async debit(
    walletId: string,
    amount: number,
    /** Pass `false` to reverse a mirror credit without counting as withdrawn. */
    field: 'totalWithdrawn' | 'totalRedeemed' | false = 'totalWithdrawn',
    session?: ClientSession,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const wallet = await this.walletModel.findById(walletId).session(session || null);
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.balance - wallet.lockedBalance < amount) {
      throw new BadRequestException('Insufficient balance');
    }
    wallet.balance -= amount;
    if (field) {
      wallet[field] += amount;
    }
    await wallet.save({ session });
    await this.invalidateCache(wallet.userId.toString());
    return wallet;
  }

  async lock(walletId: string, amount: number, session?: ClientSession) {
    const wallet = await this.walletModel.findById(walletId).session(session || null);
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.balance - wallet.lockedBalance < amount) {
      throw new BadRequestException('Insufficient balance to lock');
    }
    wallet.lockedBalance += amount;
    await wallet.save({ session });
    await this.invalidateCache(wallet.userId.toString());
    return wallet;
  }

  async unlock(walletId: string, amount: number, session?: ClientSession) {
    const wallet = await this.walletModel.findById(walletId).session(session || null);
    if (!wallet) throw new NotFoundException('Wallet not found');
    wallet.lockedBalance = Math.max(0, wallet.lockedBalance - amount);
    await wallet.save({ session });
    await this.invalidateCache(wallet.userId.toString());
    return wallet;
  }

  async getAvailableBalance(userId: string, currency = Currency.INR): Promise<number> {
    const wallet = await this.getOrCreate(userId, currency);
    return wallet.balance - wallet.lockedBalance;
  }

  async getRedeemableAmount(userId: string): Promise<number> {
    const wallet = await this.getOrCreate(userId);
    const credited = wallet.totalDeposited + wallet.totalInvested;
    const redeemed = wallet.totalRedeemed;
    const available = wallet.balance - wallet.lockedBalance;
    return Math.min(available, Math.max(0, credited - redeemed));
  }

  async adjust(
    userId: string,
    amount: number,
    type: WalletAdjustType,
    reason: string,
    adminEmail: string,
  ) {
    const wallet = await this.getOrCreate(userId);
    const balanceBefore = wallet.balance;

    if (type === WalletAdjustType.CREDIT) {
      wallet.balance += amount;
    } else {
      if (wallet.balance - wallet.lockedBalance < amount) {
        throw new BadRequestException('Insufficient balance');
      }
      wallet.balance -= amount;
    }
    await wallet.save();
    await this.invalidateCache(userId);

    await this.transactionService.record({
      userId,
      walletId: wallet._id.toString(),
      type: LedgerType.ADJUSTMENT,
      amount,
      balanceBefore,
      balanceAfter: wallet.balance,
      referenceType: 'wallet_adjustment',
      referenceId: wallet._id.toString(),
      description: `Admin adjustment (${type}) by ${adminEmail}: ${reason}`,
    });

    return wallet;
  }

  private async invalidateCache(userId: string) {
    await this.redis.del(`wallet:user:${userId}`);
  }
}
