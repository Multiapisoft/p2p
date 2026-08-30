import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { UsdtDetailsDto } from '../../deposit/dto/deposit.dto';
import { ListQueryDto } from '../../../common/dto/list-query.dto';
import {
  IsOptionalAppTxHash,
  IsOptionalAppUtr,
} from '../../../common/validators/contact.validators';

export class WithdrawalListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  method?: string;

  /** Business list: `user` = non-business origins; `business` = business-origin WDs. */
  @IsOptional()
  @IsString()
  origin?: string;
}

export class WithdrawalUpiDetailsDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'UPI ID is required' })
  upiId?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Name of Account Holder is required' })
  @MinLength(2, { message: 'Name of Account Holder is required' })
  @Matches(/^[A-Za-z ]+$/, {
    message: 'Name of Account Holder must contain letters and spaces only (no numbers)',
  })
  payerName!: string;

  @IsOptional()
  @IsString()
  qrImageKey?: string;

  @IsOptional()
  @IsString()
  qrImageUrl?: string;
}

export class WithdrawalCdmDetailsDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  locationHint?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  notes?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Name of Account Holder is required' })
  @MinLength(2)
  @Matches(/^[A-Za-z ]+$/, {
    message: 'Name of Account Holder must contain letters and spaces only (no numbers)',
  })
  payerName!: string;
}

export class WithdrawalBankDetailsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\d{9,18}$/, {
    message: 'Account number must be 9 to 18 digits',
  })
  accountNumber!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, {
    message: 'IFSC must be 11 characters (e.g. SBIN0001234)',
  })
  ifscCode!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Account holder name is required' })
  @MinLength(2, { message: 'Account holder name is required' })
  @Matches(/^[A-Za-z ]+$/, {
    message: 'Account holder name must contain letters and spaces only (no numbers)',
  })
  accountHolderName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Bank name is required' })
  bankName!: string;
}

export class CreateWithdrawalDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @ValidateNested()
  @Type(() => WithdrawalUpiDetailsDto)
  upiDetails?: WithdrawalUpiDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WithdrawalBankDetailsDto)
  bankDetails?: WithdrawalBankDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UsdtDetailsDto)
  usdtDetails?: UsdtDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WithdrawalCdmDetailsDto)
  cdmDetails?: WithdrawalCdmDetailsDto;

  @IsOptional()
  @IsString()
  integrationToken?: string;

  /** Business only: jump FIFO queue when listed for P2P pay. */
  @IsOptional()
  @IsBoolean()
  priority?: boolean;
}

export class UpdateWithdrawalDestinationDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => WithdrawalUpiDetailsDto)
  upiDetails?: WithdrawalUpiDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WithdrawalBankDetailsDto)
  bankDetails?: WithdrawalBankDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UsdtDetailsDto)
  usdtDetails?: UsdtDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WithdrawalCdmDetailsDto)
  cdmDetails?: WithdrawalCdmDetailsDto;
}

export class ProcessWithdrawalDto {
  @IsOptionalAppUtr()
  utr?: string;

  @IsOptionalAppTxHash()
  txHash?: string;

  @IsOptional()
  @IsString()
  proofImageKey?: string;

  @IsOptional()
  @IsString()
  proofImageUrl?: string;
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

export class AssignWithdrawalDto {
  @IsString()
  @MinLength(1)
  assigneeId!: string;
}

export class SetWithdrawalPriorityDto {
  @IsBoolean()
  priority!: boolean;
}
