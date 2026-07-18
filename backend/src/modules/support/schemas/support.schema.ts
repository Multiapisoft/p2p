import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SupportStatus, SupportPriority } from '../../../common/enums/support-status.enum';

export type SupportTicketDocument = HydratedDocument<SupportTicket>;

@Schema({ _id: false })
export class TicketReply {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  @Prop({ required: true, unique: true })
  ticketId!: string;

  /** Ticket opener (usually the withdrawer who raised the dispute). */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /**
   * Other parties who can view/reply (e.g. investor/payer on a withdrawal dispute).
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [], index: true })
  participantIds!: Types.ObjectId[];

  /** Related business — business owner can see these dispute tickets. */
  @Prop({ type: Types.ObjectId, ref: 'Business', index: true })
  businessId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'WithdrawalPayment' })
  relatedPaymentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Withdrawal', index: true })
  relatedWithdrawalId?: Types.ObjectId;

  @Prop({ required: true })
  subject!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ type: String, enum: SupportStatus, default: SupportStatus.OPEN })
  status!: SupportStatus;

  @Prop({ type: String, enum: SupportPriority, default: SupportPriority.MEDIUM })
  priority!: SupportPriority;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo?: Types.ObjectId;

  @Prop({ type: [TicketReply], default: [] })
  replies!: TicketReply[];

  @Prop()
  category?: string;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
SupportTicketSchema.index({ status: 1, priority: 1 });
SupportTicketSchema.index(
  { relatedPaymentId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { relatedPaymentId: { $type: 'objectId' } } },
);
