import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { UserStatus } from '../../../common/enums/currency.enum';
import { IntegrationUrls, IntegrationUrlsSchema } from './integration-urls.schema';
import { PartnerApiConfig, PartnerApiConfigSchema } from './partner-api.schema';

export type BusinessDocument = HydratedDocument<Business>;

@Schema({ timestamps: true, collection: 'businesses' })
export class Business {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, unique: true })
  apiKey!: string;

  @Prop({ required: true })
  apiSecretHash!: string;

  @Prop({ unique: true, sparse: true })
  internalKey?: string;

  @Prop()
  internalSecretHash?: string;

  @Prop({ unique: true, sparse: true })
  referralCode?: string;

  @Prop({ trim: true })
  webhookUrl?: string;

  @Prop({ type: IntegrationUrlsSchema, default: {} })
  integrationUrls!: IntegrationUrls;

  @Prop({ type: PartnerApiConfigSchema, default: {} })
  partnerApi!: PartnerApiConfig;

  @Prop({ default: 0 })
  commissionRate!: number;

  /** Max INR investors can pay toward this business's withdrawals (0 = unlimited). */
  @Prop({ default: 0 })
  p2pPayLimit!: number;

  /** Cumulative investor pay amount reserved/completed against p2pPayLimit. */
  @Prop({ default: 0 })
  p2pPayUsed!: number;

  @Prop({ default: 0 })
  totalDeposits!: number;

  @Prop({ default: 0 })
  totalWithdrawals!: number;

  @Prop({ default: 0 })
  totalUsers!: number;

  @Prop({ default: 0 })
  totalCommissionEarned!: number;

  @Prop({ type: [String], enum: PaymentMethod, default: Object.values(PaymentMethod) })
  allowedPaymentMethods!: PaymentMethod[];

  @Prop({ type: String, enum: UserStatus, default: UserStatus.PENDING })
  status!: UserStatus;
}

export const BusinessSchema = SchemaFactory.createForClass(Business);
