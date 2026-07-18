import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import type { BusinessDocument } from '../business/schemas/business.schema';
import { WalletService } from '../wallet/wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { WebhookService } from '../webhook/webhook.service';
import { DepositService } from '../deposit/deposit.service';
import { WithdrawalService } from '../withdrawal/withdrawal.service';
import { Currency, LedgerType } from '../../common/enums/currency.enum';

@Injectable()
export class IntegrationUserWalletService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private walletService: WalletService,
    private transactionService: TransactionService,
    private webhookService: WebhookService,
    private depositService: DepositService,
    private withdrawalService: WithdrawalService,
  ) {}

  private async assertBusinessUser(businessId: string, userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    if (user.referredByBusiness?.toString() !== businessId) {
      throw new ForbiddenException('User does not belong to this business');
    }
    return user;
  }

  async getUserBalance(businessId: string, userId: string, currency = Currency.INR) {
    await this.assertBusinessUser(businessId, userId);
    const wallet = await this.walletService.getOrCreate(userId, currency, businessId);
    return {
      userId,
      currency,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      availableBalance: wallet.balance - wallet.lockedBalance,
      totalDeposited: wallet.totalDeposited,
      totalWithdrawn: wallet.totalWithdrawn,
    };
  }

  async creditUser(
    business: BusinessDocument,
    userId: string,
    amount: number,
    externalRef?: string,
    reason?: string,
  ) {
    const businessId = business._id.toString();
    await this.assertBusinessUser(businessId, userId);
    const currency = Currency.INR;

    const ownerWallet = await this.walletService.getOrCreate(business.ownerId.toString(), currency);
    const available = ownerWallet.balance - ownerWallet.lockedBalance;
    if (available < amount) {
      throw new BadRequestException('Insufficient business wallet balance');
    }

    const userWallet = await this.walletService.getOrCreate(userId, currency, businessId);
    const ownerBalanceBefore = ownerWallet.balance;

    await this.walletService.debit(ownerWallet._id.toString(), amount);
    const updatedUserWallet = await this.walletService.credit(userWallet._id.toString(), amount);
    const updatedOwnerWallet = await this.walletService.getOrCreate(
      business.ownerId.toString(),
      currency,
    );

    await this.transactionService.record({
      userId: business.ownerId.toString(),
      walletId: ownerWallet._id.toString(),
      type: LedgerType.WITHDRAWAL,
      amount,
      currency,
      balanceBefore: ownerBalanceBefore,
      balanceAfter: updatedOwnerWallet.balance,
      referenceType: 'integration_user_credit',
      referenceId: userId,
      description: reason || `Credit to integrated user ${userId}`,
      businessId,
    });

    await this.transactionService.record({
      userId,
      walletId: userWallet._id.toString(),
      type: LedgerType.DEPOSIT,
      amount,
      currency,
      balanceBefore: updatedUserWallet.balance - amount,
      balanceAfter: updatedUserWallet.balance,
      referenceType: 'integration_credit',
      referenceId: externalRef || userId,
      description: reason || 'Balance credited by business partner',
      businessId,
    });

    await this.webhookService.dispatch(businessId, 'user.credited', {
      userId,
      amount,
      currency,
      externalRef,
      availableBalance: updatedUserWallet.balance - updatedUserWallet.lockedBalance,
    });

    return this.getUserBalance(businessId, userId, currency);
  }

  async debitUser(
    business: BusinessDocument,
    userId: string,
    amount: number,
    externalRef?: string,
    reason?: string,
  ) {
    const businessId = business._id.toString();
    await this.assertBusinessUser(businessId, userId);
    const currency = Currency.INR;

    const userWallet = await this.walletService.getOrCreate(userId, currency, businessId);
    const available = userWallet.balance - userWallet.lockedBalance;
    if (available < amount) {
      throw new BadRequestException('Insufficient user balance');
    }

    const ownerWallet = await this.walletService.getOrCreate(business.ownerId.toString(), currency);
    const userBalanceBefore = userWallet.balance;

    await this.walletService.debit(userWallet._id.toString(), amount);
    const updatedOwnerWallet = await this.walletService.credit(ownerWallet._id.toString(), amount);
    const updatedUserWallet = await this.walletService.getOrCreate(userId, currency, businessId);

    await this.transactionService.record({
      userId,
      walletId: userWallet._id.toString(),
      type: LedgerType.WITHDRAWAL,
      amount,
      currency,
      balanceBefore: userBalanceBefore,
      balanceAfter: updatedUserWallet.balance,
      referenceType: 'integration_debit',
      referenceId: externalRef || userId,
      description: reason || 'Balance debited by business partner',
      businessId,
    });

    await this.transactionService.record({
      userId: business.ownerId.toString(),
      walletId: ownerWallet._id.toString(),
      type: LedgerType.DEPOSIT,
      amount,
      currency,
      balanceBefore: updatedOwnerWallet.balance - amount,
      balanceAfter: updatedOwnerWallet.balance,
      referenceType: 'integration_user_debit',
      referenceId: userId,
      description: reason || `Debit from integrated user ${userId}`,
      businessId,
    });

    await this.webhookService.dispatch(businessId, 'user.debited', {
      userId,
      amount,
      currency,
      externalRef,
      availableBalance: updatedUserWallet.balance - updatedUserWallet.lockedBalance,
    });

    return this.getUserBalance(businessId, userId, currency);
  }

  async cancelDeposit(businessId: string, referenceId: string) {
    return this.depositService.cancelForBusiness(businessId, referenceId);
  }

  async cancelWithdrawal(businessId: string, referenceId: string) {
    const withdrawal = await this.withdrawalService.cancelForBusiness(businessId, referenceId);
    await this.webhookService.dispatch(businessId, 'withdrawal.cancelled', {
      referenceId: withdrawal.referenceId,
      userId: withdrawal.userId.toString(),
      amount: withdrawal.amount,
    });
    return withdrawal;
  }
}
