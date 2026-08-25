import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  CommissionAppliesTo,
  CommissionFeeMode,
  CommissionTarget,
} from '../../../common/enums/commission-target.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export type CommissionConfigDocument = HydratedDocument<CommissionConfig>;

@Schema({ timestamps: true, collection: 'commission_configs' })
export class CommissionConfig {
  @Prop({ type: String, enum: CommissionTarget, required: true })
  targetType!: CommissionTarget;

  @Prop({ type: Types.ObjectId, index: true })
  targetId?: Types.ObjectId;

  @Prop({ type: String, enum: PaymentMethod })
  paymentMethod?: PaymentMethod;

  /** percentage | fixed | both — default both keeps old configs working */
  @Prop({ type: String, enum: CommissionFeeMode, default: CommissionFeeMode.BOTH })
  feeMode!: CommissionFeeMode;

  @Prop({ default: 0 })
  percentage!: number;

  @Prop({ default: 0 })
  fixedFee!: number;

  /** Optional amount range. If both unset → applies to all amounts (no range). */
  @Prop()
  minAmount?: number;

  @Prop()
  maxAmount?: number;

  /**
   * deposit | withdrawal | all.
   * Unset / all = legacy rules that apply to both deposit and withdrawal.
   */
  @Prop({ type: String, enum: CommissionAppliesTo, default: CommissionAppliesTo.ALL })
  appliesTo!: CommissionAppliesTo;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  description?: string;
}

export const CommissionConfigSchema = SchemaFactory.createForClass(CommissionConfig);
CommissionConfigSchema.index({ targetType: 1, targetId: 1, paymentMethod: 1, isActive: 1 });
CommissionConfigSchema.index({ targetType: 1, targetId: 1, appliesTo: 1, isActive: 1 });
