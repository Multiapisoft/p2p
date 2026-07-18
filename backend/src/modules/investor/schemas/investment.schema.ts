import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export type InvestmentDocument = HydratedDocument<Investment>;

@Schema({ timestamps: true, collection: 'investments' })
export class Investment {
  @Prop({ required: true, unique: true })
  referenceId!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  investorId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  walletId!: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({ type: String, enum: PaymentMethod, required: true })
  method!: PaymentMethod;

  @Prop({ type: String, enum: TransactionStatus, default: TransactionStatus.PENDING })
  status!: TransactionStatus;

  @Prop()
  processedBy?: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  failureReason?: string;

  @Prop()
  note?: string;
}

export const InvestmentSchema = SchemaFactory.createForClass(Investment);
