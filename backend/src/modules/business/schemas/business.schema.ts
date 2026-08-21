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

  /**
   * Admin seed INR for Platform Payment quota.
   * Cap = seed + earned deposits. Remaining = cap − used. Never unlimited.
   */
  @Prop({ default: 0 })
  p2pPayLimit!: number;

  /** INR earned when this business's users complete deposits / pay any user. */
  @Prop({ default: 0 })
  p2pPayEarned!: number;

  /** Cumulative pay/withdrawal amount reserved/completed against the quota. */
  @Prop({ default: 0 })
  p2pPayUsed!: number;

  @Prop({ default: 0 })
  totalDeposits!: number;

  @Prop({ default: 0 })
  totalWithdrawals!: number;

  @Prop({ default: 0 })
  totalUsers!: number;

  /** Max linked users. 0 = use platform default (`maxUsersPerBusiness`). */
  @Prop({ default: 0 })
  maxUsers!: number;

  @Prop({ default: 0 })
  totalCommissionEarned!: number;

  @Prop({ type: [String], enum: PaymentMethod, default: Object.values(PaymentMethod) })
  allowedPaymentMethods!: PaymentMethod[];

  /** Super-admin: allow this business to create deposits / match pays (Noida #49). */
  @Prop({ default: true })
  depositsEnabled!: boolean;

  /** Super-admin: allow this business (and its users) to create withdrawals (Noida #49). */
  @Prop({ default: true })
  withdrawalsEnabled!: boolean;

  /** When true with platform preferB2bSettlement, prioritize this biz for B2B match. */
  @Prop({ default: true })
  b2bMatchingEnabled!: boolean;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.PENDING })
  status!: UserStatus;
}

export const BusinessSchema = SchemaFactory.createForClass(Business);
