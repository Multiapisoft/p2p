import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentConfig, PaymentConfigSchema } from './schemas/payment-config.schema';
import { PaymentConfigService } from './payment-config.service';
import { PaymentConfigController } from './payment-config.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PaymentConfig.name, schema: PaymentConfigSchema }]),
  ],
  controllers: [PaymentConfigController],
  providers: [PaymentConfigService],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}
