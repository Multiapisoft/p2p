import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, BusinessDocument } from '../business/schemas/business.schema';

export type WebhookEvent =
  | 'deposit.created'
  | 'deposit.approved'
  | 'deposit.rejected'
  | 'deposit.cancelled'
  | 'withdrawal.created'
  | 'withdrawal.approved'
  | 'withdrawal.rejected'
  | 'withdrawal.cancelled'
  | 'user.registered'
  | 'user.credited'
  | 'user.debited';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    private config: ConfigService,
  ) {}

  async dispatch(businessId: string, event: WebhookEvent, data: Record<string, unknown>) {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business?.webhookUrl) return;

    const payload = {
      event,
      businessId: business._id.toString(),
      timestamp: new Date().toISOString(),
      data,
    };

    const secret = this.config.get<string>('app.webhookSecret') || business.apiKey;
    const signature = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    try {
      const response = await fetch(business.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': signature,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Webhook failed for ${businessId}: HTTP ${response.status}`);
      }
    } catch (err) {
      this.logger.warn(`Webhook delivery failed for ${businessId}: ${(err as Error).message}`);
    }
  }

  async testWebhook(business: BusinessDocument) {
    if (!business.webhookUrl) {
      return { success: false, message: 'No webhook URL configured' };
    }
    await this.dispatch(business._id.toString(), 'deposit.created', {
      test: true,
      message: 'Webhook test from P2P Platform',
    });
    return { success: true, message: 'Test webhook dispatched', url: business.webhookUrl };
  }
}
