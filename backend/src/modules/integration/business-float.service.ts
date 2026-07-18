import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { WalletService } from '../wallet/wallet.service';
import { Currency } from '../../common/enums/currency.enum';
import { LedgerType } from '../../common/enums/currency.enum';
import { TransactionService } from '../transaction/transaction.service';

@Injectable()
export class BusinessFloatService {
  constructor(
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    private walletService: WalletService,
    private transactionService: TransactionService,
  ) {}

  async lockFloatForDeposit(businessId: string, amount: number, currency: Currency = Currency.INR) {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) return null;

    const ownerWallet = await this.walletService.getOrCreate(
      business.ownerId.toString(),
      currency,
    );
    const available = ownerWallet.balance - ownerWallet.lockedBalance;
    if (available < amount) {
      throw new BadRequestException(
        'Business partner has insufficient wallet balance for this transaction',
      );
    }

    await this.walletService.lock(ownerWallet._id.toString(), amount);
    return {
      ownerWalletId: ownerWallet._id.toString(),
      ownerId: business.ownerId.toString(),
      amount,
    };
  }

  async releaseFloatLock(ownerWalletId: string, amount: number) {
    await this.walletService.unlock(ownerWalletId, amount);
  }

  async debitFloatOnDepositApprove(
    businessId: string,
    ownerWalletId: string,
    amount: number,
    currency: Currency,
    depositId: string,
    ownerId: string,
  ) {
    const wallet = await this.walletService.getOrCreate(ownerId, currency);
    const balanceBefore = wallet.balance;

    await this.walletService.unlock(ownerWalletId, amount);
    const updated = await this.walletService.debit(
      ownerWalletId,
      amount,
      'totalWithdrawn',
    );

    await this.transactionService.record({
      userId: ownerId,
      walletId: ownerWalletId,
      type: LedgerType.WITHDRAWAL,
      amount,
      currency,
      balanceBefore,
      balanceAfter: updated.balance,
      referenceType: 'integration_deposit_float',
      referenceId: depositId,
      description: `Float deducted for integrated user deposit`,
      businessId,
    });

    return updated;
  }

  async creditFloatOnWithdrawalApprove(
    businessId: string,
    ownerId: string,
    amount: number,
    currency: Currency,
    withdrawalId: string,
  ) {
    const ownerWallet = await this.walletService.getOrCreate(ownerId, currency);
    const balanceBefore = ownerWallet.balance;
    const updated = await this.walletService.credit(
      ownerWallet._id.toString(),
      amount,
      'totalDeposited',
    );

    await this.transactionService.record({
      userId: ownerId,
      walletId: ownerWallet._id.toString(),
      type: LedgerType.DEPOSIT,
      amount,
      currency,
      balanceBefore,
      balanceAfter: updated.balance,
      referenceType: 'integration_withdrawal_float',
      referenceId: withdrawalId,
      description: `Float credited for integrated user withdrawal`,
      businessId,
    });

    return updated;
  }
}
