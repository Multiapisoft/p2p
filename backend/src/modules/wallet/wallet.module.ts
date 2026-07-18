import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { ExchangeRateService } from './exchange-rate.service';

import { TransactionModule } from '../transaction/transaction.module';
import { UsersModule } from '../users/users.module';
import { BusinessModule } from '../business/business.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Wallet.name, schema: WalletSchema }]),
    TransactionModule,
    UsersModule,
    forwardRef(() => BusinessModule),
    forwardRef(() => IntegrationModule),
  ],
  controllers: [WalletController],
  providers: [WalletService, ExchangeRateService],
  exports: [WalletService, ExchangeRateService],
})
export class WalletModule {}
