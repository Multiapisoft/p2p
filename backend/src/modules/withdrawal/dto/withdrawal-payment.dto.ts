import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class WithdrawalPaymentListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  method?: string;
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

  @IsString()
  @MinLength(6)
  utr!: string;

  @IsString()
  proofImageKey!: string;

  @IsString()
  proofImageUrl!: string;
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
