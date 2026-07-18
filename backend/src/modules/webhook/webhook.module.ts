import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhookService } from './webhook.service';
import { Business, BusinessSchema } from '../business/schemas/business.schema';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Business.name, schema: BusinessSchema }])],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
