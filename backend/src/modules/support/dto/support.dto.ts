import { IsEnum, IsOptional, IsString } from 'class-validator';
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

export class CreateTicketDto {
  @IsString()
  subject!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;

  @IsOptional()
  @IsString()
  category?: string;
}

export class ReplyTicketDto {
  @IsString()
  message!: string;
}

export class UpdateTicketStatusDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
