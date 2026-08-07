import { IsString, MinLength, IsOptional, IsArray, IsEnum } from 'class-validator';
import { UserStatus } from '../../../common/enums/currency.enum';
import { IsAppEmail } from '../../../common/validators/contact.validators';

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
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
