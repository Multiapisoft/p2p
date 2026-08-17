import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Currency } from '../../../common/enums/currency.enum';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';

export type WithdrawalPaymentDocument = HydratedDocument<WithdrawalPayment>;

@Schema({ timestamps: true, collection: 'withdrawal_payments' })
export class WithdrawalPayment {
  @Prop({ required: true, unique: true })
  referenceId!: string;

  @Prop({ type: Types.ObjectId, ref: 'Withdrawal', required: true, index: true })
  withdrawalId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  payerUserId!: Types.ObjectId;

  /** Withdrawal owner's business (commission / P2P limit). */
  @Prop({ type: Types.ObjectId, ref: 'Business', index: true })
  businessId?: Types.ObjectId;

  /** Payer's referred business — so Biz2 can see outbound pays by its users. */
  @Prop({ type: Types.ObjectId, ref: 'Business', index: true })
  payerBusinessId?: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({ type: String, enum: Currency, default: Currency.INR })
  currency!: Currency;

  @Prop({ required: true, trim: true })
  utr!: string;

  @Prop({ required: true })
  proofImageKey!: string;

  @Prop({ required: true })
  proofImageUrl!: string;

  @Prop({ type: String, enum: TransactionStatus, default: TransactionStatus.PENDING })
  status!: TransactionStatus;

  @Prop({ default: 0 })
  commissionAmount!: number;

  /** Extra credited to investor after verification (business investor_bonus rules). */
  @Prop({ default: 0 })
  bonusAmount!: number;

  @Prop({ default: 0 })
  netCreditedAmount!: number;

  /** Snapshot estimated at submit time (shown to investor before verify). */
  @Prop({ default: 0 })
  estimatedNetCredited!: number;

  @Prop({ default: 0 })
  estimatedBonusAmount!: number;

  @Prop({ default: 0 })
  estimatedCommissionAmount!: number;

  @Prop()
  processedBy?: string;

  @Prop()
  rejectionReason?: string;

  @Prop()
  completedAt?: Date;

  /** Auto-approve after this time if still pending (verification window). */
  @Prop()
  autoApproveAt?: Date;

  /** Audit note (user received / auto-24h / dispute). */
  @Prop()
  notes?: string;

  /** Withdrawer raised a dispute — blocks auto-approve. */
  @Prop()
  disputedAt?: Date;

  @Prop()
  disputeTicketId?: string;
}

export const WithdrawalPaymentSchema = SchemaFactory.createForClass(WithdrawalPayment);
WithdrawalPaymentSchema.index({ status: 1, createdAt: -1 });
WithdrawalPaymentSchema.index({ withdrawalId: 1, status: 1 });
WithdrawalPaymentSchema.index({ status: 1, autoApproveAt: 1 });
