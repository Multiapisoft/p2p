import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { Currency } from '../../../common/enums/currency.enum';

export type DepositDocument = HydratedDocument<Deposit>;

@Schema({ _id: false })
export class UpiDetails {
  @Prop()
  upiId?: string;

  @Prop()
  payerName?: string;

  @Prop()
  utr?: string;

  /** Uploaded UPI QR / scanner (XOR with upiId — Noida #37). */
  @Prop()
  qrImageKey?: string;

  @Prop()
  qrImageUrl?: string;
}

@Schema({ _id: false })
export class BankDetails {
  @Prop({ required: true })
  accountNumber!: string;

  @Prop({ required: true })
  ifscCode!: string;

  @Prop({ required: true })
  accountHolderName!: string;

  @Prop()
  bankName?: string;

  @Prop()
  utr?: string;
}

@Schema({ _id: false })
export class UsdtDetails {
  @Prop({ required: true })
  walletAddress!: string;

  @Prop()
  network?: string;

  @Prop()
  txHash?: string;
}

@Schema({ _id: false })
export class CdmDetails {
  @Prop()
  locationHint?: string;

  @Prop()
  notes?: string;

  @Prop()
  payerName?: string;
}

@Schema({ timestamps: true, collection: 'deposits' })
export class Deposit {
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

  @Prop({ type: UpiDetails })
  upiDetails?: UpiDetails;

  @Prop({ type: BankDetails })
  bankDetails?: BankDetails;

  @Prop({ type: UsdtDetails })
  usdtDetails?: UsdtDetails;

  @Prop({ type: CdmDetails })
  cdmDetails?: CdmDetails;

  @Prop({ default: 0 })
  commissionAmount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  commissionPaidTo?: Types.ObjectId;

  @Prop()
  externalRef?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  completedAt?: Date;

  @Prop()
  failureReason?: string;
}

export const DepositSchema = SchemaFactory.createForClass(Deposit);
DepositSchema.index({ status: 1, createdAt: -1 });
DepositSchema.index({ businessId: 1, status: 1 });
