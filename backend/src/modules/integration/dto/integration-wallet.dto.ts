import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class IntegrationWalletAdjustDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
