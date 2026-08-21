import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Withdrawal, WithdrawalSchema } from './schemas/withdrawal.schema';
import {
  WithdrawalPayment,
  WithdrawalPaymentSchema,
} from './schemas/withdrawal-payment.schema';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalPaymentService } from './withdrawal-payment.service';
import { WithdrawalPaymentCronService } from './withdrawal-payment-cron.service';
import { WithdrawalController } from './withdrawal.controller';
import { WithdrawalPaymentController } from './withdrawal-payment.controller';
import { WalletModule } from '../wallet/wallet.module';
import { CommissionModule } from '../commission/commission.module';
import { TransactionModule } from '../transaction/transaction.module';
import { BusinessModule } from '../business/business.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationModule } from '../notification/notification.module';
import { WebhookModule } from '../webhook/webhook.module';
import { AuditModule } from '../audit/audit.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { IntegrationModule } from '../integration/integration.module';
import { Business, BusinessSchema } from '../business/schemas/business.schema';
import { SupportModule } from '../support/support.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: WithdrawalPayment.name, schema: WithdrawalPaymentSchema },
      { name: User.name, schema: UserSchema },
      { name: Business.name, schema: BusinessSchema },
    ]),
    WalletModule,
    CommissionModule,
    TransactionModule,
    forwardRef(() => BusinessModule),
    StorageModule,
    NotificationModule,
    WebhookModule,
    AuditModule,
    SupportModule,
    PlatformSettingsModule,
    UsersModule,
    forwardRef(() => IntegrationModule),
  ],
  controllers: [WithdrawalController, WithdrawalPaymentController],
  providers: [WithdrawalService, WithdrawalPaymentService, WithdrawalPaymentCronService],
  exports: [WithdrawalService, WithdrawalPaymentService],
})
export class WithdrawalModule {}
