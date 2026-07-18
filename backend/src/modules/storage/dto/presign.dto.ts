import { IsIn, IsOptional, IsString } from 'class-validator';

export class PresignUploadDto {
  @IsString()
  filename!: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])
  contentType!: string;

  @IsOptional()
  @IsString()
  @IsIn(['deposit-proof', 'withdrawal-payment-proof'])
  purpose?: 'deposit-proof' | 'withdrawal-payment-proof';
}
