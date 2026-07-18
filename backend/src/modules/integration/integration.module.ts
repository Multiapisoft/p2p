import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BusinessIntegrationController } from '../business/business-integration.controller';
import { IntegrationPublicController } from './integration-public.controller.js';
import { BusinessPortalIntegrationController } from './business-portal-integration.controller';
import { BusinessModule } from '../business/business.module';
import { UsersModule } from '../users/users.module';
import { DepositModule } from '../deposit/deposit.module';
import { WithdrawalModule } from '../withdrawal/withdrawal.module';
import { TransactionModule } from '../transaction/transaction.module';
import { WalletModule } from '../wallet/wallet.module';
import {
  IntegrationRedirectSession,
  IntegrationRedirectSchema,
} from './schemas/integration-redirect.schema';
import { Business, BusinessSchema } from '../business/schemas/business.schema';
import { IntegrationRedirectService } from './integration-redirect.service';
import { BusinessFloatService } from './business-float.service';
import { IntegrationUserWalletService } from './integration-user-wallet.service';
import { IntegrationConfigService } from './integration-config.service';
import { PartnerApiService } from './partner-api.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IntegrationRedirectSession.name, schema: IntegrationRedirectSchema },
      { name: Business.name, schema: BusinessSchema },
      { name: User.name, schema: UserSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get('jwt.expiresIn') },
      }),
    }),
    forwardRef(() => BusinessModule),
    UsersModule,
    forwardRef(() => DepositModule),
    forwardRef(() => WithdrawalModule),
    WalletModule,
    TransactionModule,
    WebhookModule,
  ],
  controllers: [
    BusinessIntegrationController,
    IntegrationPublicController,
    BusinessPortalIntegrationController,
  ],
  providers: [
    IntegrationRedirectService,
    BusinessFloatService,
    IntegrationUserWalletService,
    IntegrationConfigService,
    PartnerApiService,
  ],
  exports: [
    IntegrationRedirectService,
    BusinessFloatService,
    IntegrationUserWalletService,
    IntegrationConfigService,
    PartnerApiService,
  ],
})
export class IntegrationModule {}
