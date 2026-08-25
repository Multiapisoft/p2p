import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/currency.enum';

export type UserDocument = HydratedDocument<User>;

export type SavedWithdrawalMethod = {
  _id?: Types.ObjectId;
  label: string;
  method: 'upi' | 'bank' | 'usdt';
  isDefault?: boolean;
  upiDetails?: { upiId?: string; payerName?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string };
  createdAt?: Date;
  updatedAt?: Date;
};

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: String, enum: UserRole, required: true, default: UserRole.USER })
  role!: UserRole;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Prop({ type: Types.ObjectId, ref: 'Business', index: true })
  referredByBusiness?: Types.ObjectId;

  /** Investor who referred this user (Noida #41). */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  referredByInvestor?: Types.ObjectId;

  /** Third-party site's user id — unique per business */
  @Prop({ trim: true, index: true })
  externalRef?: string;

  /** Human ID code set by the referring business */
  @Prop({ trim: true, index: true })
  businessUserCode?: string;

  @Prop({ trim: true, index: true })
  referralCode?: string;

  /** Investor selected plan amount (INR) — legacy; new flow uses investorLimitLots. */
  @Prop()
  investorPlanAmount?: number;

  @Prop()
  investorPlanSelectedAt?: Date;

  /** Stack of added pay-limit lots. Newest is consumed first (LIFO). */
  @Prop({
    type: [
      {
        amount: { type: Number, required: true },
        remaining: { type: Number, required: true },
        createdAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  investorLimitLots!: { amount: number; remaining: number; createdAt: Date }[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  /** Partner SSO first login — user should set their own password */
  @Prop({ default: false })
  mustSetPassword?: boolean;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ default: false })
  twoFactorEnabled?: boolean;

  @Prop({ select: false })
  twoFactorSecret?: string;

  /** SHA-256 of 6-digit forgot-password code (select:false). */
  @Prop({ select: false })
  passwordResetCodeHash?: string;

  @Prop({ select: false })
  passwordResetExpires?: Date;

  /** Set when this account is business staff (not the owner). */
  @Prop({ type: Types.ObjectId, ref: 'Business', index: true })
  staffBusinessId?: Types.ObjectId;

  @Prop({
    type: [
      {
        label: { type: String, required: true, trim: true },
        method: { type: String, enum: ['upi', 'bank', 'usdt'], required: true },
        isDefault: { type: Boolean, default: false },
        upiDetails: {
          upiId: { type: String },
          payerName: { type: String },
        },
        bankDetails: {
          accountNumber: { type: String },
          ifscCode: { type: String },
          accountHolderName: { type: String },
          bankName: { type: String },
        },
        usdtDetails: {
          walletAddress: { type: String },
          network: { type: String },
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  savedWithdrawalMethods?: SavedWithdrawalMethod[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ role: 1, status: 1 });
/** Unique partner externalRef per business — only when externalRef is a non-empty string */
UserSchema.index(
  { referredByBusiness: 1, externalRef: 1 },
  {
    unique: true,
    name: 'referredByBusiness_1_externalRef_1_partial',
    partialFilterExpression: {
      externalRef: { $type: 'string', $gt: '' },
      referredByBusiness: { $exists: true },
    },
  },
);
/** Unique businessUserCode per business — only when set to a non-empty string */
UserSchema.index(
  { referredByBusiness: 1, businessUserCode: 1 },
  {
    unique: true,
    name: 'referredByBusiness_1_businessUserCode_1_partial',
    partialFilterExpression: {
      businessUserCode: { $type: 'string', $gt: '' },
      referredByBusiness: { $exists: true },
    },
  },
);
