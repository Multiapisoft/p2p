import { IsIn, IsOptional, IsString } from 'class-validator';

export class PresignUploadDto {
  @IsString()
  filename!: string;

  @IsString()
  contentType!: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'deposit-proof',
    'withdrawal-payment-proof',
    'withdrawal-approve-proof',
    'support-ticket',
    'upi-qr',
  ])
  purpose?:
    | 'deposit-proof'
    | 'withdrawal-payment-proof'
    | 'withdrawal-approve-proof'
    | 'support-ticket'
    | 'upi-qr';
}
