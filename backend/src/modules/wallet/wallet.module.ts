import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { PlatformCommissionService } from './platform-commission.service';

import { TransactionModule } from '../transaction/transaction.module';
import { UsersModule } from '../users/users.module';
import { BusinessModule } from '../business/business.module';
import { IntegrationModule } from '../integration/integration.module';
import { AuditModule } from '../audit/audit.module';
import { Withdrawal, WithdrawalSchema } from '../withdrawal/schemas/withdrawal.schema';
import { Deposit, DepositSchema } from '../deposit/schemas/deposit.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: Deposit.name, schema: DepositSchema },
    ]),
    TransactionModule,
    UsersModule,
    forwardRef(() => BusinessModule),
    forwardRef(() => IntegrationModule),
    AuditModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, ExchangeRateService, PlatformCommissionService],
  exports: [WalletService, ExchangeRateService, PlatformCommissionService],
})
export class WalletModule {}
