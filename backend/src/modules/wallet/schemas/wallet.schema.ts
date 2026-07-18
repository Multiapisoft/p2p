import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Currency } from '../../../common/enums/currency.enum';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ timestamps: true, collection: 'wallets' })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Business', index: true })
  businessId?: Types.ObjectId;

  @Prop({ type: String, enum: Currency, default: Currency.INR })
  currency!: Currency;

  @Prop({ default: 0 })
  balance!: number;

  @Prop({ default: 0 })
  lockedBalance!: number;

  @Prop({ default: 0 })
  totalDeposited!: number;

  @Prop({ default: 0 })
  totalWithdrawn!: number;

  @Prop({ default: 0 })
  totalInvested!: number;

  @Prop({ default: 0 })
  totalRedeemed!: number;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
WalletSchema.index({ userId: 1, currency: 1 }, { unique: true });
