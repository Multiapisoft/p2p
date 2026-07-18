import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsObject,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { Currency } from '../../../common/enums/currency.enum';

export class CreatePaymentConfigDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsString()
  label!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAmount?: number;

  @IsObject()
  details!: Record<string, string>;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class UpdatePaymentConfigDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAmount?: number;

  @IsOptional()
  @IsObject()
  details?: Record<string, string>;

  @IsOptional()
  @IsString()
  instructions?: string;
}
