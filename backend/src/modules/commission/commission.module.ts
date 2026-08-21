import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommissionConfig, CommissionConfigSchema } from './schemas/commission.schema';
import { CommissionService } from './commission.service';
import { CommissionController } from './commission.controller';
import { Business, BusinessSchema } from '../business/schemas/business.schema';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommissionConfig.name, schema: CommissionConfigSchema },
      { name: Business.name, schema: BusinessSchema },
    ]),
    forwardRef(() => BusinessModule),
  ],
  controllers: [CommissionController],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionModule {}
