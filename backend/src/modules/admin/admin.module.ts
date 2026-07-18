import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Deposit, DepositSchema } from '../deposit/schemas/deposit.schema';
import { Withdrawal, WithdrawalSchema } from '../withdrawal/schemas/withdrawal.schema';
import { Business, BusinessSchema } from '../business/schemas/business.schema';
import { UsersModule } from '../users/users.module';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Deposit.name, schema: DepositSchema },
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: Business.name, schema: BusinessSchema },
    ]),
    UsersModule,
    CommissionModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
