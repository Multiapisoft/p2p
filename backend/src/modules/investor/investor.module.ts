import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Redemption, RedemptionSchema } from './schemas/redemption.schema';
import { Investment, InvestmentSchema } from './schemas/investment.schema';
import {
  WithdrawalPayment,
  WithdrawalPaymentSchema,
} from '../withdrawal/schemas/withdrawal-payment.schema';
import { InvestorService } from './investor.service';
import { InvestorController } from './investor.controller';
import { WalletModule } from '../wallet/wallet.module';
import { CommissionModule } from '../commission/commission.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Redemption.name, schema: RedemptionSchema },
      { name: Investment.name, schema: InvestmentSchema },
      { name: WithdrawalPayment.name, schema: WithdrawalPaymentSchema },
    ]),
    WalletModule,
    CommissionModule,
    TransactionModule,
  ],
  controllers: [InvestorController],
  providers: [InvestorService],
  exports: [InvestorService],
})
export class InvestorModule {}
