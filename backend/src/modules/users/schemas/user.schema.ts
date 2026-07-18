import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/currency.enum';

export type UserDocument = HydratedDocument<User>;

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

  /** Third-party site's user id — unique per business */
  @Prop({ trim: true, index: true })
  externalRef?: string;

  @Prop({ trim: true, index: true })
  referralCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  /** Partner SSO first login — user should set their own password */
  @Prop({ default: false })
  mustSetPassword?: boolean;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ role: 1, status: 1 });
UserSchema.index(
  { referredByBusiness: 1, externalRef: 1 },
  { unique: true, sparse: true },
);
