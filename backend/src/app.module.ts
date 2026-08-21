import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BusinessModule } from './modules/business/business.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { DepositModule } from './modules/deposit/deposit.module';
import { WithdrawalModule } from './modules/withdrawal/withdrawal.module';
import { CommissionModule } from './modules/commission/commission.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { InvestorModule } from './modules/investor/investor.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AuditModule } from './modules/audit/audit.module';
import { PaymentConfigModule } from './modules/payment-config/payment-config.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { NotificationModule } from './modules/notification/notification.module';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { RealtimeModule } from './modules/realtime/realtime.module'; // P2P live pay-list sockets
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    RedisModule,
    RealtimeModule,
    WebhookModule,
    AuditModule,
    NotificationModule,
    AuthModule,
    UsersModule,
    BusinessModule,
    IntegrationModule,
    WalletModule,
    DepositModule,
    WithdrawalModule,
    CommissionModule,
    TransactionModule,
    InvestorModule,
    SupportModule,
    AdminModule,
    PaymentConfigModule,
    PlatformSettingsModule,
    HealthModule,
    StorageModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
