import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
  ValidateIf,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CommissionFeeMode,
  CommissionTarget,
  CommissionAppliesTo,
} from '../../../common/enums/commission-target.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export class CreateCommissionDto {
  @IsEnum(CommissionTarget)
  targetType!: CommissionTarget;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(CommissionAppliesTo)
  appliesTo?: CommissionAppliesTo;

  @IsOptional()
  @IsEnum(CommissionFeeMode)
  feeMode?: CommissionFeeMode;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCommissionDto {
  @IsOptional()
  @IsEnum(CommissionFeeMode)
  feeMode?: CommissionFeeMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CommissionRuleInputDto {
  @IsOptional()
  @IsString()
  _id?: string;

  @IsEnum(CommissionFeeMode)
  feeMode!: CommissionFeeMode;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsNumber()
  @Min(0)
  fixedFee!: number;

  @IsOptional()
  @IsBoolean()
  useRange?: boolean;

  @ValidateIf((o: CommissionRuleInputDto) => !!o.useRange)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ValidateIf((o: CommissionRuleInputDto) => !!o.useRange)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertBusinessCommissionsDto {
  /** @deprecated Prefer businessTakeDeposit / businessTakeWithdrawal */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionRuleInputDto)
  businessTake?: CommissionRuleInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionRuleInputDto)
  businessTakeDeposit?: CommissionRuleInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionRuleInputDto)
  businessTakeWithdrawal?: CommissionRuleInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionRuleInputDto)
  investorBonus?: CommissionRuleInputDto[];

  /** Admin seed INR. User / business-funded deposits add earned quota. Remaining is never unlimited. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  p2pPayLimit?: number;
}
