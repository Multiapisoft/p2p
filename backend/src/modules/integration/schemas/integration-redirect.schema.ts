import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Currency } from '../../../common/enums/currency.enum';

export type IntegrationRedirectDocument = HydratedDocument<IntegrationRedirectSession>;

export enum IntegrationRedirectType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  PORTAL = 'portal',
}

export enum IntegrationRedirectStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'integration_redirect_sessions' })
export class IntegrationRedirectSession {
  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ required: true, enum: IntegrationRedirectType })
  type!: IntegrationRedirectType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Business', required: true, index: true })
  businessId!: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  amount!: number;

  @Prop({ type: String, enum: Currency, default: Currency.INR })
  currency!: Currency;

  /** Partner return URL after portal/deposit flow (optional for SSO-only launch) */
  @Prop({ default: '' })
  returnUrl!: string;

  @Prop()
  externalRef?: string;

  /** First-time partner register — show credentials once on portal redirect */
  @Prop({ default: false })
  isNewUser?: boolean;

  /** One-time plaintext password for first-time welcome (cleared after claim) */
  @Prop({ select: false })
  initialPassword?: string;

  @Prop({ type: String, enum: IntegrationRedirectStatus, default: IntegrationRedirectStatus.PENDING })
  status!: IntegrationRedirectStatus;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  resultReferenceId?: string;

  @Prop()
  resultId?: string;
}

export const IntegrationRedirectSchema = SchemaFactory.createForClass(IntegrationRedirectSession);
IntegrationRedirectSchema.index({ expiresAt: 1 });
