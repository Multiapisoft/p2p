import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Business, BusinessSchema } from './schemas/business.schema';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { InternalKeyGuard } from '../../common/guards/internal-key.guard';
import { UsersModule } from '../users/users.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Business.name, schema: BusinessSchema }]),
    forwardRef(() => UsersModule),
    forwardRef(() => IntegrationModule),
  ],
  controllers: [BusinessController],
  providers: [BusinessService, ApiKeyGuard, InternalKeyGuard],
  exports: [BusinessService, ApiKeyGuard, InternalKeyGuard],
})
export class BusinessModule {}
