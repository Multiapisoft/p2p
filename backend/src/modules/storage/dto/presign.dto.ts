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
    'p2p-limit-proof',
  ])
  purpose?:
    | 'deposit-proof'
    | 'withdrawal-payment-proof'
    | 'withdrawal-approve-proof'
    | 'support-ticket'
    | 'upi-qr'
    | 'p2p-limit-proof';
}
