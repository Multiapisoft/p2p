import { IsArray, IsBoolean, IsNumber, IsOptional, Min, ArrayMinSize, IsEnum } from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

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
}
