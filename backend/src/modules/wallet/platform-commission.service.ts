import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSession } from 'mongoose';
import { WalletService } from './wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { UsersRepository } from '../users/users.repository';
import { UserRole } from '../../common/enums/role.enum';
import {
  Currency,
  LedgerDirection,
  LedgerFlow,
  LedgerType,
} from '../../common/enums/currency.enum';
import {
  businessFeeInDescription,
  investorCommissionOutDescription,
  partyLabel,
  platformFeeInDescription,
  depositGivenToDescription,
} from './utils/platform-commission-ledger.util';
import { UserDocument } from '../users/schemas/user.schema';

export type PlatformFeeKind = 'platform' | 'business';

export type PlatformSettleParams = {
  amount: number;
  currency?: Currency;
  fromUserId: string;
  fromName: string;
  fromRole?: string;
  referenceType: string;
  referenceId: string;
  referenceLabel: string;
  businessId?: string;
  session?: ClientSession;
  kind?: PlatformFeeKind;
};

export type CollectedFeesSettleParams = Omit<PlatformSettleParams, 'amount' | 'kind'> & {
  platformAmount: number;
  businessAmount: number;
};

export type InvestorCommissionSettleParams = {
  amount: number;
  currency?: Currency;
  toUserId: string;
  toName: string;
  toRole?: string;
  referenceType: string;
  referenceId: string;
  referenceLabel: string;
  businessId?: string;
  session?: ClientSession;
};

export type DepositGivenToParams = {
  amount: number;
  currency?: Currency;
  toUserId: string;
  toName: string;
  toRole?: string;
  fromName?: string;
  fromRole?: string;
  referenceType: string;
  referenceId: string;
  referenceLabel: string;
  businessId?: string;
  session?: ClientSession;
};

@Injectable()
export class PlatformCommissionService {
  constructor(
    private walletService: WalletService,
    private transactionService: TransactionService,
    private usersRepo: UsersRepository,
    private config: ConfigService,
  ) {}

  async findPlatformAdmin(): Promise<UserDocument> {
    const email = this.config.get<string>('admin.email');
    if (email) {
      const byEmail = await this.usersRepo.findByEmail(email);
      if (byEmail?.role === UserRole.ADMIN) return byEmail;
    }
    const { items } = await this.usersRepo.findAll(
      { role: UserRole.ADMIN },
      0,
      1,
      { createdAt: 1 },
    );
    if (!items.length) {
      throw new NotFoundException('Platform admin user not found');
    }
    return items[0];
  }

  async getPlatformWallet(currency: Currency = Currency.INR) {
    const admin = await this.findPlatformAdmin();
    const wallet = await this.walletService.getOrCreate(
      admin._id.toString(),
      currency,
    );
    return {
      admin,
      wallet,
      availableBalance: wallet.balance - (wallet.lockedBalance || 0),
    };
  }

  /** Platform / business fee collected → credit admin wallet with from/to ledger. */
  async creditPlatformFee(params: PlatformSettleParams) {
    if (params.amount <= 0) return null;

    const currency = params.currency || Currency.INR;
    const admin = await this.findPlatformAdmin();
    const wallet = await this.walletService.getOrCreate(
      admin._id.toString(),
      currency,
    );
    const balanceBefore = wallet.balance;
    const updated = await this.walletService.credit(
      wallet._id.toString(),
      params.amount,
      false,
      params.session,
    );

    const from = partyLabel(params.fromName, params.fromRole);
    const to = partyLabel(admin.name, UserRole.ADMIN);
    const kind = params.kind || 'platform';
    const description =
      kind === 'business'
        ? businessFeeInDescription({
            amount: params.amount,
            currency,
            fromName: from,
            referenceLabel: params.referenceLabel,
          })
        : platformFeeInDescription({
            amount: params.amount,
            currency,
            fromName: from,
            referenceLabel: params.referenceLabel,
          });

    return this.transactionService.record({
      userId: admin._id.toString(),
      walletId: wallet._id.toString(),
      type: LedgerType.COMMISSION,
      direction: LedgerDirection.CREDIT,
      flow: LedgerFlow.PLATFORM_FEE,
      amount: params.amount,
      currency,
      balanceBefore,
      balanceAfter: updated.balance,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description,
      businessId: params.businessId,
      counterpartyUserId: params.fromUserId,
      fromParty: from,
      toParty: to,
    });
  }

  /** Credit platform + business take to admin wallet (sequential, same wallet). */
  async creditCollectedFees(params: CollectedFeesSettleParams) {
    const { platformAmount, businessAmount, ...common } = params;
    if (platformAmount > 0) {
      await this.creditPlatformFee({
        ...common,
        amount: platformAmount,
        kind: 'platform',
      });
    }
    if (businessAmount > 0) {
      await this.creditPlatformFee({
        ...common,
        amount: businessAmount,
        kind: 'business',
      });
    }
  }

  /**
   * Direct mark-paid: record deposit given to the withdrawer on the admin
   * commission wallet (amount credited).
   */
  async creditDepositGivenTo(params: DepositGivenToParams) {
    if (params.amount <= 0) return null;

    const currency = params.currency || Currency.INR;
    const admin = await this.findPlatformAdmin();
    const wallet = await this.walletService.getOrCreate(
      admin._id.toString(),
      currency,
    );
    const balanceBefore = wallet.balance;
    const updated = await this.walletService.credit(
      wallet._id.toString(),
      params.amount,
      false,
      params.session,
    );

    const from = partyLabel(params.fromName || admin.name, params.fromRole || UserRole.ADMIN);
    const to = partyLabel(params.toName, params.toRole);

    return this.transactionService.record({
      userId: admin._id.toString(),
      walletId: wallet._id.toString(),
      type: LedgerType.DEPOSIT,
      direction: LedgerDirection.CREDIT,
      amount: params.amount,
      currency,
      balanceBefore,
      balanceAfter: updated.balance,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: depositGivenToDescription({
        amount: params.amount,
        currency,
        toName: to,
        referenceLabel: params.referenceLabel,
      }),
      businessId: params.businessId,
      counterpartyUserId: params.toUserId,
      fromParty: from,
      toParty: to,
    });
  }

  /**
   * Investor commission paid by platform → debit admin wallet.
   * Investor credit is recorded separately by the payment flow.
   */
  async debitInvestorCommission(params: InvestorCommissionSettleParams) {
    if (params.amount <= 0) return null;

    const currency = params.currency || Currency.INR;
    const admin = await this.findPlatformAdmin();
    const wallet = await this.walletService.getOrCreate(
      admin._id.toString(),
      currency,
    );
    const balanceBefore = wallet.balance;
    const updated = await this.walletService.debit(
      wallet._id.toString(),
      params.amount,
      false,
      params.session,
      { allowOverdraft: true },
    );

    const from = partyLabel(admin.name, UserRole.ADMIN);
    const to = partyLabel(params.toName, params.toRole || UserRole.INVESTOR);

    return this.transactionService.record({
      userId: admin._id.toString(),
      walletId: wallet._id.toString(),
      type: LedgerType.COMMISSION,
      direction: LedgerDirection.DEBIT,
      flow: LedgerFlow.INVESTOR_COMMISSION,
      amount: params.amount,
      currency,
      balanceBefore,
      balanceAfter: updated.balance,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      description: investorCommissionOutDescription({
        amount: params.amount,
        currency,
        toName: to,
        referenceLabel: params.referenceLabel,
      }),
      businessId: params.businessId,
      counterpartyUserId: params.toUserId,
      fromParty: from,
      toParty: to,
    });
  }
}
