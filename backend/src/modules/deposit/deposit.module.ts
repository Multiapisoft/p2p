import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Deposit, DepositSchema } from './schemas/deposit.schema';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { WalletModule } from '../wallet/wallet.module';
import { CommissionModule } from '../commission/commission.module';
import { TransactionModule } from '../transaction/transaction.module';
import { BusinessModule } from '../business/business.module';
import { PaymentConfigModule } from '../payment-config/payment-config.module';
import { IntegrationModule } from '../integration/integration.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { Business, BusinessSchema } from '../business/schemas/business.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Withdrawal, WithdrawalSchema } from '../withdrawal/schemas/withdrawal.schema';
import {
  WithdrawalPayment,
  WithdrawalPaymentSchema,
} from '../withdrawal/schemas/withdrawal-payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Deposit.name, schema: DepositSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: User.name, schema: UserSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: WithdrawalPayment.name, schema: WithdrawalPaymentSchema },
    ]),
    WalletModule,
    CommissionModule,
    TransactionModule,
    forwardRef(() => BusinessModule),
    PaymentConfigModule,
    forwardRef(() => IntegrationModule),
    PlatformSettingsModule,
  ],
  controllers: [DepositController],
  providers: [DepositService],
  exports: [DepositService],
})
export class DepositModule {}
