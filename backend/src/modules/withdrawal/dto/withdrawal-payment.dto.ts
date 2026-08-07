import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ListQueryDto } from '../../../common/dto/list-query.dto';
import { IsAppPaymentRef } from '../../../common/validators/contact.validators';

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

  @IsAppPaymentRef()
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
