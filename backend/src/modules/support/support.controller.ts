import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { SupportService } from './support.service';
import {
  CreateTicketDto,
  ReplyTicketDto,
  UpdateTicketStatusDto,
  SupportListQueryDto,
} from './dto/support.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';

@Controller('support')
export class SupportController {
  constructor(private supportService: SupportService) {}

  @Post('tickets')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.supportService.create(user.userId, dto);
  }

  @Get('tickets')
  getMyTickets(@CurrentUser() user: AuthenticatedUser, @Query() query: SupportListQueryDto) {
    return this.supportService.findAccessible(user.userId, user.role, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      sort: query.sort,
      category: query.category,
      priority: query.priority,
    });
  }

  @Get('tickets/all')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  getAllTickets(@Query() query: SupportListQueryDto) {
    return this.supportService.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      sort: query.sort,
      category: query.category,
      priority: query.priority,
    });
  }

  @Get('tickets/:ticketId')
  getTicket(@CurrentUser() user: AuthenticatedUser, @Param('ticketId') ticketId: string) {
    const isStaff = [UserRole.ADMIN, UserRole.SUB_ADMIN].includes(user.role);
    return this.supportService.findByTicketId(
      ticketId,
      isStaff ? undefined : user.userId,
      isStaff ? undefined : user.role,
    );
  }

  @Post('tickets/:ticketId/reply')
  reply(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.supportService.reply(ticketId, user.userId, dto, user.role);
  }

  @Patch('tickets/:ticketId')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  updateStatus(@Param('ticketId') ticketId: string, @Body() dto: UpdateTicketStatusDto) {
    return this.supportService.updateStatus(ticketId, dto);
  }
}
