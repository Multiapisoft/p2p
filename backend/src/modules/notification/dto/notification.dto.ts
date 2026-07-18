import { IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class NotificationListQueryDto extends ListQueryDto {
  /** Query string "true" filters to unread only */
  @IsOptional()
  @IsString()
  unreadOnly?: string;
}
