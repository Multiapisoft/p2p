import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export enum WalletAdjustType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export class WalletAdjustDto {
  @ValidateIf((o: WalletAdjustDto) => !o.email && !o.phone)
  @IsString()
  userId?: string;

  @ValidateIf((o: WalletAdjustDto) => !o.userId && !o.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((o: WalletAdjustDto) => !o.userId && !o.email)
  @IsString()
  phone?: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(WalletAdjustType)
  type!: WalletAdjustType;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
