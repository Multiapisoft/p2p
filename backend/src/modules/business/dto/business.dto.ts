import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  IsBoolean,
  IsIn,
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

  @IsOptional()
  @IsBoolean()
  depositsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  withdrawalsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  b2bMatchingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPartialPay?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMobileNumberUpi?: boolean;
}

export class RegenerateApiKeysDto {
  @IsOptional()
  @IsString()
  confirm?: string;
}

export class SetP2pPayLimitDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  p2pPayLimit!: number;

  /** Absolute set (default), or add/deduct from current seed. */
  @IsOptional()
  @IsIn(['set', 'add', 'deduct'])
  mode?: 'set' | 'add' | 'deduct';
}

export class SetHighlightLimitDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  highlightLimitPerMonth!: number;
}
