import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  Min,
  ArrayMinSize,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  investorClaimLockMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  investorPaySubmitMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  withdrawalUserEditTatMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  investorPlanAmounts?: number[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  investorPlanTargetMultiplier?: number;

  @IsOptional()
  @IsBoolean()
  allowMobileNumberUpi?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PaymentMethod, { each: true })
  investorAllowedDepositMethods?: PaymentMethod[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PaymentMethod, { each: true })
  investorAllowedWithdrawalMethods?: PaymentMethod[];

  @IsOptional()
  @IsBoolean()
  showCommissionToInvestor?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(300)
  minTransactionAmount?: number;

  @IsOptional()
  @IsBoolean()
  allowPartialPay?: boolean;

  @IsOptional()
  @IsBoolean()
  preferB2bSettlement?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  cdmHoldMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralFirstReferrerPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralFirstJoinerPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralNextReferrerPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralNextJoinerPercent?: number;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  investorReferralPeriodFromDate?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  investorReferralPeriodToDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralPeriodFirstReferrerPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralPeriodFirstJoinerPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralPeriodNextReferrerPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  investorReferralPeriodNextJoinerPercent?: number;
}
