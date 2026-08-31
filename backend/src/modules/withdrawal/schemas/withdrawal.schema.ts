import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { Currency } from '../../../common/enums/currency.enum';
import { UpiDetails, BankDetails, UsdtDetails, CdmDetails } from '../../deposit/schemas/deposit.schema';

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

  @Prop({ type: CdmDetails })
  cdmDetails?: CdmDetails;

  /** Evidence when admin/business marks paid directly (Noida #64). */
  @Prop()
  approveProofKey?: string;

  @Prop()
  approveProofUrl?: string;

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
   * FinGuard was topped up so a business-linked user can open a P2P withdrawal
   * without wallet/partner balance. Reversed on cancel/reject.
   */
  @Prop({ default: false })
  p2pAdvanceCredited?: boolean;

  /** Amount credited as P2P advance (shortfall vs lock). */
  @Prop()
  p2pAdvanceAmount?: number;

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

  /**
   * Gate for P2P pay list: awaiting → listed (admin/business) → payers can fulfill.
   * Final wallet settle still uses status + payment approvals.
   */
  @Prop({ type: String, enum: ['awaiting', 'listed', 'rejected'], default: 'awaiting', index: true })
  p2pListStatus!: 'awaiting' | 'listed' | 'rejected';

  @Prop()
  p2pListedAt?: Date;

  @Prop()
  p2pListedBy?: string;

  @Prop()
  p2pListRejectReason?: string;

  /**
   * Who opened this request. Business-origin WDs count against the P2P pay
   * limit and appear on user/investor pay lists as soon as they are created.
   */
  @Prop({ type: String, enum: ['user', 'investor', 'business'], default: 'user', index: true })
  origin?: 'user' | 'investor' | 'business';
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  claimLockedBy?: Types.ObjectId;

  /** Hide from other payers until this time (claim lock). */
  @Prop({ index: true })
  claimLockedUntil?: Date;

  /** Deadline for the claimer to submit payment proof. */
  @Prop()
  claimPayDeadline?: Date;

  /**
   * Exclusive payer: only this user/investor sees the request on the pay list
   * and may submit UTR / slip proof.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assignedTo?: Types.ObjectId;

  @Prop()
  assignedBy?: string;

  @Prop()
  assignedAt?: Date;

  /** Jump FIFO pay queue when true (business withdrawals). */
  @Prop({ default: false, index: true })
  priority?: boolean;

  @Prop()
  priorityAt?: Date;
}

export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);
WithdrawalSchema.index({ status: 1, createdAt: -1 });
WithdrawalSchema.index({ p2pListStatus: 1, status: 1, createdAt: -1 });
WithdrawalSchema.index({ createdAt: 1, origin: 1 });
