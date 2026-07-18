import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import {
  UpiDetailsDto,
  BankDetailsDto,
  UsdtDetailsDto,
} from '../../deposit/dto/deposit.dto';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class InvestorListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  method?: string;
}

export class CreateRedemptionDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpiDetailsDto)
  upiDetails?: UpiDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UsdtDetailsDto)
  usdtDetails?: UsdtDetailsDto;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateInvestmentDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ProcessRedemptionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectRedemptionDto {
  @IsString()
  reason!: string;
}
