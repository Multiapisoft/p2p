import { IsString, MinLength, IsOptional } from 'class-validator';
import { IsAppEmail, IsAppPhone } from '../../../common/validators/contact.validators';

export class IntegrationRegisterUserDto {
  @IsAppEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsAppPhone()
  phone!: string;

  /** Partner platform user id, e.g. `bitfarming:{mongoId}` */
  @IsOptional()
  @IsString()
  externalRef?: string;
}

export class LinkExternalRefDto {
  @IsString()
  @MinLength(1)
  externalRef!: string;
}
