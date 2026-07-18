import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class IntegrationUrls {
  @Prop({ trim: true })
  partnerSiteUrl?: string;

  /** User returns here after deposit/withdrawal on FinGuard user panel */
  @Prop({ trim: true })
  returnUrl?: string;

  /** Partner page that shows wallet balance (your site path or full URL) */
  @Prop({ trim: true })
  balancePageUrl?: string;

  /** Partner page for credit action */
  @Prop({ trim: true })
  creditPageUrl?: string;

  /** Partner page for debit action */
  @Prop({ trim: true })
  debitPageUrl?: string;
}

export const IntegrationUrlsSchema = SchemaFactory.createForClass(IntegrationUrls);
