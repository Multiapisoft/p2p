import { IsString, MinLength, IsOptional, IsEnum, ValidateIf, Matches } from 'class-validator';
import { UserRole } from '../../../common/enums/role.enum';
import { IsAppEmail, IsAppPhone } from '../../../common/validators/contact.validators';

export class LoginDto {
  @IsAppEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  totpCode?: string;
}

export class RegisterDto {
  @IsAppEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  /** Required for user / investor. Optional for business self-register. */
  @ValidateIf((o: RegisterDto) => o.role !== UserRole.BUSINESS || !!o.phone)
  @IsAppPhone()
  phone?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  referralCode?: string;

  /** Business display name — used when role=business to auto-create entity + referral code */
  @IsOptional()
  @IsString()
  businessName?: string;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class EnableTwoFactorDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @IsString()
  password!: string;
}
