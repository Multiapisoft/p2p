import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupportPriority } from '../../../common/enums/support-status.enum';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class SupportListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

export class TicketAttachmentDto {
  @IsString()
  key!: string;

  @IsString()
  publicUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  filename?: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsNumber()
  size?: number;
}

export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  subject!: string;

  @ValidateIf((o: CreateTicketDto) => !o.attachments?.length)
  @IsString()
  @MinLength(1)
  message?: string;

  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TicketAttachmentDto)
  attachments?: TicketAttachmentDto[];
}

export class ReplyTicketDto {
  @ValidateIf((o: ReplyTicketDto) => !o.attachments?.length)
  @IsString()
  @MinLength(1)
  message?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TicketAttachmentDto)
  attachments?: TicketAttachmentDto[];
}

export class UpdateTicketStatusDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  /**
   * Required when resolving/closing a withdrawal_dispute ticket with a pending disputed payment.
   * received → verify/approve payment; not_received → cancel deposit + unlock WD reserved slot.
   */
  @IsOptional()
  @IsString()
  @IsIn(['received', 'not_received'])
  disputeOutcome?: 'received' | 'not_received';

  /**
   * When disputeOutcome=received: amount actually received (≤ disputed payment amount).
   * Partial receive verifies only this amount; remainder unlocks on the WD.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  receivedAmount?: number;
}
