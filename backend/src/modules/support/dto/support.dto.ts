import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  MaxLength,
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
}
