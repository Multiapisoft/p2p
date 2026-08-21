import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { Currency } from '../../../common/enums/currency.enum';

export type PaymentConfigDocument = HydratedDocument<PaymentConfig>;

@Schema({ timestamps: true, collection: 'payment_configs' })
export class PaymentConfig {
  @Prop({ type: String, enum: PaymentMethod, required: true })
  method!: PaymentMethod;

  @Prop({ type: String, enum: Currency, default: Currency.INR })
  currency!: Currency;

  @Prop({ required: true })
  label!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: 300 })
  minAmount!: number;

  @Prop({ default: 500000 })
  maxAmount!: number;

  @Prop({ type: Object, default: {} })
  details!: Record<string, string>;

  @Prop()
  instructions?: string;
}

export const PaymentConfigSchema = SchemaFactory.createForClass(PaymentConfig);
PaymentConfigSchema.index({ method: 1, currency: 1 }, { unique: true });
