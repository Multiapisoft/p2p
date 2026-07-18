import { IsNumber, IsString, IsEnum, Min } from 'class-validator';

export enum WalletAdjustType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export class WalletAdjustDto {
  @IsString()
  userId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsEnum(WalletAdjustType)
  type!: WalletAdjustType;

  @IsString()
  reason!: string;
}
