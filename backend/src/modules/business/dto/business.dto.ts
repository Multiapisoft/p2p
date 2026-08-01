import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  Min,
  Max,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { IntegrationUrlsDto } from './integration-urls.dto';
import { PartnerApiDto } from './partner-api.dto';
import { Type } from 'class-transformer';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class BusinessListQueryDto extends ListQueryDto {}

export class CreateBusinessDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;

  /** Optional — partner wallet URLs can be added later. Referral code is created without them. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PartnerApiDto)
  partnerApi?: PartnerApiDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(PaymentMethod, { each: true })
  allowedPaymentMethods?: PaymentMethod[];
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => IntegrationUrlsDto)
  integrationUrls?: IntegrationUrlsDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(PaymentMethod, { each: true })
  allowedPaymentMethods?: PaymentMethod[];
}

export class RegenerateApiKeysDto {
  @IsOptional()
  @IsString()
  confirm?: string;
}
