import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LedgerEntry, LedgerEntrySchema } from './schemas/ledger.schema';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LedgerEntry.name, schema: LedgerEntrySchema }]),
    forwardRef(() => BusinessModule),
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
