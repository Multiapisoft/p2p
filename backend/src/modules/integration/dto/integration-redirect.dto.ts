import { IsNumber, IsOptional, IsString, IsUrl, IsBoolean, Min, MinLength } from 'class-validator';

export class CreateRedirectDto {
  @IsString()
  userId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}

export class CreatePortalRedirectDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  /** First register from partner — portal shows email + password once */
  @IsOptional()
  @IsBoolean()
  isNewUser?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  initialPassword?: string;
}

export class ClaimRedirectDto {
  @IsString()
  token!: string;
}
