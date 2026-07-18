import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { Currency } from '../../../common/enums/currency.enum';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class DepositListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  method?: string;
}

export class UpiDetailsDto {
  @IsString()
  upiId!: string;

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsOptional()
  @IsString()
  utr?: string;
}

export class BankDetailsDto {
  @IsString()
  accountNumber!: string;

  @IsString()
  ifscCode!: string;

  @IsString()
  accountHolderName!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  utr?: string;
}

export class UsdtDetailsDto {
  @IsString()
  walletAddress!: string;

  @IsOptional()
  @IsString()
  network?: string;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class CreateDepositDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

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
  externalRef?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  integrationToken?: string;
}

export class ApproveDepositDto {
  @IsOptional()
  @IsString()
  utr?: string;

  @IsOptional()
  @IsString()
  txHash?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectDepositDto {
  @IsString()
  reason!: string;
}

export class IntegrationCreateDepositDto extends CreateDepositDto {
  @IsString()
  userId!: string;
}
