import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { Currency } from '../../../common/enums/currency.enum';
import { ListQueryDto } from '../../../common/dto/list-query.dto';
import {
  IsOptionalAppTxHash,
  IsOptionalAppUtr,
} from '../../../common/validators/contact.validators';

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

  @IsOptionalAppUtr()
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

  @IsOptionalAppUtr()
  utr?: string;
}

export class UsdtDetailsDto {
  @IsString()
  walletAddress!: string;

  @IsOptional()
  @IsString()
  network?: string;

  @IsOptionalAppTxHash()
  txHash?: string;
}

export class DepositCdmDetailsDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : value,
  )
  @IsString({ message: 'Bank name is required' })
  @MinLength(2, { message: 'Bank name is required' })
  @Matches(/^[A-Z. ]+$/, {
    message: 'Bank name may only contain letters, dots, and spaces',
  })
  bankName!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  locationHint?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  notes?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z. ]+$/, {
    message: 'Name of Account Holder may only contain letters, dots, and spaces',
  })
  payerName?: string;
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
  @ValidateNested()
  @Type(() => DepositCdmDetailsDto)
  cdmDetails?: DepositCdmDetailsDto;

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
  @IsOptionalAppUtr()
  utr?: string;

  @IsOptionalAppTxHash()
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
