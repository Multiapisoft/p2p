import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import {
  UpiDetailsDto,
  BankDetailsDto,
  UsdtDetailsDto,
} from '../../deposit/dto/deposit.dto';
import { ListQueryDto } from '../../../common/dto/list-query.dto';
import {
  IsOptionalAppTxHash,
  IsOptionalAppUtr,
} from '../../../common/validators/contact.validators';

export class WithdrawalListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  method?: string;
}

export class CreateWithdrawalDto {
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
  integrationToken?: string;
}

export class ProcessWithdrawalDto {
  @IsOptionalAppUtr()
  utr?: string;

  @IsOptionalAppTxHash()
  txHash?: string;
}

export class RejectWithdrawalDto {
  @IsString()
  reason!: string;
}

export class RejectP2pListDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
