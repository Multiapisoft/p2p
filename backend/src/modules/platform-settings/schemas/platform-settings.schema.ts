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

  @Prop({ type: [Number], default: [25000, 50000, 100000, 200000] })
  investorPlanAmounts!: number[];

  @Prop({ default: 1.1 })
  investorPlanTargetMultiplier!: number;
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);
