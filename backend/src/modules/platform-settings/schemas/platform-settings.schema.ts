import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformSettingsDocument = HydratedDocument<PlatformSettings>;

@Schema({ timestamps: true, collection: 'platform_settings' })
export class PlatformSettings {
  @Prop({ default: 7 })
  investorClaimLockMinutes!: number;

  @Prop({ default: 5 })
  investorPaySubmitMinutes!: number;

  @Prop({ default: 2 })
  withdrawalUserEditTatMinutes!: number;

  @Prop({ type: [Number], default: [25000, 50000, 75000, 100000, 200000] })
  investorPlanAmounts!: number[];

  @Prop({ default: 1.1 })
  investorPlanTargetMultiplier!: number;

  /** When true, 10-digit mobile UPIs like 9876543210@paytm are allowed. */
  @Prop({ default: false })
  allowMobileNumberUpi!: boolean;

  /**
   * Deposit (P2P pay) methods investors may use.
   * Empty / missing = all methods enabled.
   */
  @Prop({ type: [String], default: ['upi', 'bank', 'usdt', 'cdm'] })
  investorAllowedDepositMethods!: string[];

  /**
   * Withdrawal methods investors may use.
   * Empty / missing = all methods enabled.
   */
  @Prop({ type: [String], default: ['upi', 'bank', 'usdt', 'cdm'] })
  investorAllowedWithdrawalMethods!: string[];

  /** When false, investor pay-list / claim UI hides bonus (credit still applied). */
  @Prop({ default: true })
  showCommissionToInvestor!: boolean;

  /** Minimum INR create amount for deposits and withdrawals (Noida #31). */
  @Prop({ default: 300 })
  minTransactionAmount!: number;

  /** When false, payers must pay full remaining only (Noida #53). */
  @Prop({ default: true })
  allowPartialPay!: boolean;

  /** Prefer business↔business / business-user WDs before investor (Noida #50). */
  @Prop({ default: true })
  preferB2bSettlement!: boolean;

  /** Extra hold minutes for CDM destinations before listing widely (Noida #51). */
  @Prop({ default: 30 })
  cdmHoldMinutes!: number;

  /** Investor referral: % of principal to referrer on referred investor's first completed P2P pay. */
  @Prop({ default: 2 })
  investorReferralFirstReferrerPercent!: number;

  /** Investor referral: % of principal to joiner on their first completed P2P pay. */
  @Prop({ default: 1 })
  investorReferralFirstJoinerPercent!: number;

  /** Investor referral: % to referrer on subsequent completed pays. */
  @Prop({ default: 1 })
  investorReferralNextReferrerPercent!: number;

  /** Investor referral: % to joiner on subsequent completed pays (default 0). */
  @Prop({ default: 0 })
  investorReferralNextJoinerPercent!: number;
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);
