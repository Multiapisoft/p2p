import { IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class IntegrationUrlsDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  partnerSiteUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;

  @IsOptional()
  @IsString()
  balancePageUrl?: string;

  @IsOptional()
  @IsString()
  creditPageUrl?: string;

  @IsOptional()
  @IsString()
  debitPageUrl?: string;
}

export class UpdateIntegrationUrlsDto {
  @ValidateNested()
  @Type(() => IntegrationUrlsDto)
  integrationUrls!: IntegrationUrlsDto;
}
