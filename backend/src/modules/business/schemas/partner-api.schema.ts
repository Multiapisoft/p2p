import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Third-party API endpoints FinGuard calls for balance / credit / debit. */
@Schema({ _id: false })
export class PartnerApiConfig {
  @Prop({ trim: true })
  /** Partner API origin (optional). Paths are derived as /api/p2p/partner/* */
  baseUrl?: string;

  @Prop({ trim: true })
  balanceUrl?: string;

  @Prop({ trim: true })
  creditUrl?: string;

  @Prop({ trim: true })
  debitUrl?: string;

  @Prop({ trim: true })
  apiKey?: string;

  @Prop({ select: false })
  apiSecret?: string;
}

export const PartnerApiConfigSchema = SchemaFactory.createForClass(PartnerApiConfig);
