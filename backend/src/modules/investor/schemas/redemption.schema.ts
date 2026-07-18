import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export type RedemptionDocument = HydratedDocument<Redemption>;

@Schema({ _id: false })
class RedemptionUpiDetails {
  @Prop()
  upiId?: string;

  @Prop()
  payerName?: string;
}
const RedemptionUpiDetailsSchema = SchemaFactory.createForClass(RedemptionUpiDetails);

@Schema({ _id: false })
class RedemptionBankDetails {
  @Prop()
  accountNumber?: string;

  @Prop()
  ifscCode?: string;

  @Prop()
  accountHolderName?: string;

  @Prop()
  bankName?: string;
}
const RedemptionBankDetailsSchema = SchemaFactory.createForClass(RedemptionBankDetails);

@Schema({ _id: false })
class RedemptionUsdtDetails {
  @Prop()
  walletAddress?: string;

  @Prop()
  network?: string;
}
const RedemptionUsdtDetailsSchema = SchemaFactory.createForClass(RedemptionUsdtDetails);

@Schema({ timestamps: true, collection: 'redemptions' })
export class Redemption {
  @Prop({ required: true, unique: true })
  referenceId!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  investorId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  walletId!: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  maxRedeemable!: number;

  @Prop({ type: String, enum: PaymentMethod })
  method?: PaymentMethod;

  @Prop({ type: RedemptionUpiDetailsSchema })
  upiDetails?: RedemptionUpiDetails;

  @Prop({ type: RedemptionBankDetailsSchema })
  bankDetails?: RedemptionBankDetails;

  @Prop({ type: RedemptionUsdtDetailsSchema })
  usdtDetails?: RedemptionUsdtDetails;

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

export const RedemptionSchema = SchemaFactory.createForClass(Redemption);
