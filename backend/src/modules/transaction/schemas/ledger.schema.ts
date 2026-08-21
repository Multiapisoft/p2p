import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  Currency,
  LedgerDirection,
  LedgerFlow,
  LedgerType,
} from '../../../common/enums/currency.enum';

export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;

@Schema({ timestamps: true, collection: 'ledger_entries' })
export class LedgerEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet' })
  walletId?: Types.ObjectId;

  @Prop({ type: String, enum: LedgerType, required: true })
  type!: LedgerType;

  @Prop({ type: String, enum: LedgerDirection })
  direction?: LedgerDirection;

  @Prop({ type: String, enum: LedgerFlow })
  flow?: LedgerFlow;

  @Prop({ required: true })
  amount!: number;

  @Prop({ type: String, enum: Currency, default: Currency.INR })
  currency!: Currency;

  @Prop({ required: true })
  balanceBefore!: number;

  @Prop({ required: true })
  balanceAfter!: number;

  @Prop({ required: true })
  referenceType!: string;

  @Prop({ required: true, index: true })
  referenceId!: string;

  @Prop()
  description?: string;

  /** Other party in this movement (payer, investor, admin, …). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  counterpartyUserId?: Types.ObjectId;

  @Prop()
  fromParty?: string;

  @Prop()
  toParty?: string;

  @Prop({ type: Types.ObjectId, ref: 'Business' })
  businessId?: Types.ObjectId;
}

export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);
LedgerEntrySchema.index({ userId: 1, createdAt: -1 });
LedgerEntrySchema.index({ flow: 1, createdAt: -1 });
