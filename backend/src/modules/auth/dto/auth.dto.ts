import { IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '../../../common/enums/role.enum';
import { IsAppEmail, IsOptionalAppPhone } from '../../../common/validators/contact.validators';

export class LoginDto {
  @IsAppEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RegisterDto {
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
