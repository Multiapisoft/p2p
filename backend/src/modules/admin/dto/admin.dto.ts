import { IsString, MinLength, IsOptional, IsArray, IsEnum } from 'class-validator';
import { UserStatus } from '../../../common/enums/currency.enum';
import { IsAppEmail } from '../../../common/validators/contact.validators';
import { Permission } from '../../../common/enums/permission.enum';

export class CreateSubAdminDto {
  @IsAppEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];

  /** Businesses this sub-admin may manage. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedBusinessIds?: string[];
}

export class UpdateSubAdminDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedBusinessIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
