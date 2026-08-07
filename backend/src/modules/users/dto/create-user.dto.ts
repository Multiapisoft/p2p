import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/currency.enum';
import { ListQueryDto } from '../../../common/dto/list-query.dto';
import { IsAppEmail, IsOptionalAppPhone } from '../../../common/validators/contact.validators';

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

  @IsOptionalAppPhone()
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
