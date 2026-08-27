import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Min, MinLength, IsArray, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/currency.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { ListQueryDto } from '../../../common/dto/list-query.dto';
import { IsAppEmail, IsAppPhone, IsOptionalAppPhone } from '../../../common/validators/contact.validators';

export class UserListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateUserDto {
  @IsAppEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @ValidateIf((o: CreateUserDto) => {
    const role = o.role ?? UserRole.USER;
    return (
      role === UserRole.USER ||
      role === UserRole.INVESTOR ||
      role === UserRole.BUSINESS ||
      !!o.phone
    );
  })
  @IsAppPhone()
  phone?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class CreateBusinessStaffDto {
  @IsAppEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsOptionalAppPhone()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateBusinessStaffDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptionalAppPhone()
  phone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AttachReferralDto {
  @IsString()
  referralCode!: string;
}

export class BusinessSetUserPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class BusinessSetUserCodeDto {
  @IsString()
  @MinLength(1)
  code!: string;
}

export class SetInvestorPlanDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  planAmount!: number;
}

export class AddInvestorLimitDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;
}

export class SavedWithdrawalUpiDetailsDto {
  @IsString()
  upiId!: string;

  @IsString()
  payerName!: string;
}

export class SavedWithdrawalBankDetailsDto {
  @IsString()
  accountNumber!: string;

  @IsString()
  ifscCode!: string;

  @IsString()
  accountHolderName!: string;

  @IsString()
  bankName!: string;
}

export class SavedWithdrawalUsdtDetailsDto {
  @IsString()
  walletAddress!: string;

  @IsOptional()
  @IsString()
  network?: string;
}

export class UpsertSavedWithdrawalMethodDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsIn(['upi', 'bank', 'usdt'])
  method!: 'upi' | 'bank' | 'usdt';

  @IsOptional()
  upiDetails?: SavedWithdrawalUpiDetailsDto;

  @IsOptional()
  bankDetails?: SavedWithdrawalBankDetailsDto;

  @IsOptional()
  usdtDetails?: SavedWithdrawalUsdtDetailsDto;

  @IsOptional()
  isDefault?: boolean;
}

export class SetDefaultSavedWithdrawalMethodDto {
  @IsOptional()
  isDefault?: boolean;
}
