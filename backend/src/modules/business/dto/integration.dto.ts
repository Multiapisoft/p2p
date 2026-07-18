import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class IntegrationRegisterUserDto {
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
