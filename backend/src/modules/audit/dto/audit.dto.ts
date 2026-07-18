import { IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class AuditListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  resource?: string;
}
