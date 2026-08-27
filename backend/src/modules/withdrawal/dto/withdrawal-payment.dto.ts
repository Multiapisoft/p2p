import { IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ListQueryDto } from '../../../common/dto/list-query.dto';
import { IsAppPaymentRef } from '../../../common/validators/contact.validators';

export class WithdrawalPaymentListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  method?: string;

  /** Payer budget — full close if remaining <= this, or valid ₹5k+ partial on larger WDs. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount?: number;

  /** Filter: partial = pay amount < WD amount; full = pay amount >= WD amount. */
  @IsOptional()
  @IsString()
  payType?: 'all' | 'partial' | 'full';
}

export class CreditPreviewQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  withdrawalId?: string;
}

export class SubmitWithdrawalPaymentDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @ValidateIf((o: SubmitWithdrawalPaymentDto) => !!o.utr?.trim())
  @IsAppPaymentRef()
  utr?: string;

  @IsOptional()
  @IsString()
  proofImageKey?: string;

  @IsOptional()
  @IsString()
  proofImageUrl?: string;
}

export class RejectWithdrawalPaymentDto {
  @IsString()
  reason!: string;
}

export class DisputeWithdrawalPaymentDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  reason?: string;
}
