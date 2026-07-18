import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { Currency } from '../../../common/enums/currency.enum';
import { UpiDetails, BankDetails, UsdtDetails } from '../../deposit/schemas/deposit.schema';

export type WithdrawalDocument = HydratedDocument<Withdrawal>;

@Schema({ timestamps: true, collection: 'withdrawals' })
export class Withdrawal {
  @Prop({ required: true, unique: true })
  referenceId!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Business', index: true })
  businessId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  walletId!: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({ type: String, enum: Currency, default: Currency.INR })
  currency!: Currency;

  @Prop({ type: String, enum: PaymentMethod, required: true })
  method!: PaymentMethod;

  @Prop({ type: String, enum: TransactionStatus, default: TransactionStatus.PENDING })
  status!: TransactionStatus;

  @Prop({ default: 0 })
  paidAmount!: number;

  /** Amount held by pending payment submissions (not yet approved). */
  @Prop({ default: 0 })
  reservedAmount!: number;

  /** Principal already unlocked+debited from wallet as payments were confirmed. */
  @Prop({ default: 0 })
  settledFromLock!: number;

  @Prop({ type: UpiDetails })
  upiDetails?: UpiDetails;

  @Prop({ type: BankDetails })
  bankDetails?: BankDetails;

  @Prop({ type: UsdtDetails })
  usdtDetails?: UsdtDetails;

  @Prop({ default: 0 })
  commissionAmount!: number;

  @Prop()
  processedBy?: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  failureReason?: string;

  /** Partner (Bitfarming) earning was debited when this withdrawal was created */
  @Prop({ default: false })
  partnerDebited?: boolean;

  /**
   * Amount debited from partner wallet (may differ from `amount` when converting
   * USDT balance → INR UPI/Bank payout).
   */
  @Prop()
  sourceAmount?: number;

  @Prop({ type: String, enum: Currency })
  sourceCurrency?: Currency;

  /** INR per 1 USDT at request time (when conversion applied). */
  @Prop()
  exchangeRate?: number;
}

export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);
WithdrawalSchema.index({ status: 1, createdAt: -1 });
