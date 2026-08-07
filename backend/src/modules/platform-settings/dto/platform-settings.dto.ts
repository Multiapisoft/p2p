import { IsArray, IsNumber, IsOptional, Min, ArrayMinSize } from 'class-validator';

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
}
