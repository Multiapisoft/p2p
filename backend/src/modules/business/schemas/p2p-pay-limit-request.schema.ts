import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type P2pPayLimitRequestDocument = HydratedDocument<P2pPayLimitRequest>;

export enum P2pPayLimitRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true, collection: 'p2p_pay_limit_requests' })
export class P2pPayLimitRequest {
  @Prop({ type: Types.ObjectId, ref: 'Business', required: true, index: true })
  businessId!: Types.ObjectId;

  @Prop({ type: String, enum: ['set', 'add', 'deduct'], required: true })
  mode!: 'set' | 'add' | 'deduct';

  @Prop({ required: true })
  amount!: number;

  @Prop({ type: String, enum: P2pPayLimitRequestStatus, default: P2pPayLimitRequestStatus.PENDING, index: true })
  status!: P2pPayLimitRequestStatus;

  @Prop({ maxlength: 500 })
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  requestedBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop({ maxlength: 500 })
  rejectReason?: string;

  /** Seed snapshot at request time (for UI). */
  @Prop({ default: 0 })
  seedAtRequest?: number;
}

export const P2pPayLimitRequestSchema = SchemaFactory.createForClass(P2pPayLimitRequest);
P2pPayLimitRequestSchema.index({ status: 1, createdAt: -1 });
P2pPayLimitRequestSchema.index({ businessId: 1, status: 1, createdAt: -1 });
