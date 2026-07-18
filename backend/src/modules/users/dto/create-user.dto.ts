import { IsEmail, IsEnum, IsOptional, IsString, MinLength, IsArray } from 'class-validator';
import { UserRole } from '../../../common/enums/role.enum';
import { UserStatus } from '../../../common/enums/currency.enum';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class UserListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
