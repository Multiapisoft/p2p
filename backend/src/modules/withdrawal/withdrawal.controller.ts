import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';
import {
  CreateWithdrawalDto,
  ProcessWithdrawalDto,
  RejectWithdrawalDto,
  WithdrawalListQueryDto,
} from './dto/withdrawal.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { BusinessService } from '../business/business.service';

@Controller('withdrawals')
export class WithdrawalController {
  constructor(
    private withdrawalService: WithdrawalService,
    private businessService: BusinessService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWithdrawalDto) {
    return this.withdrawalService.create(user.userId, dto);
  }

  @Get()
  getMyWithdrawals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WithdrawalListQueryDto,
  ) {
    return this.withdrawalService.findByUser(user.userId, {
      page: query.page,
      limit: query.limit,
      status: query.status as TransactionStatus | undefined,
      search: query.search,
      sort: query.sort,
      method: query.method,
    });
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  getPending(@Query() query: WithdrawalListQueryDto) {
    return this.withdrawalService.findPending({
      page: query.page,
      limit: query.limit,
      status: query.status || TransactionStatus.PENDING,
      search: query.search,
      sort: query.sort,
      method: query.method,
    });
  }

  @Get('all')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  getAll(@Query() query: WithdrawalListQueryDto) {
    return this.withdrawalService.findAll({
      page: query.page,
      limit: query.limit,
      status: query.status,
      search: query.search,
      sort: query.sort,
      method: query.method,
    });
  }

  @Get('business')
  @Roles(UserRole.BUSINESS)
  async getBusinessWithdrawals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WithdrawalListQueryDto,
  ) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.withdrawalService.findByBusiness(business._id.toString(), {
      page: query.page,
      limit: query.limit,
      status: query.status as TransactionStatus | undefined,
      search: query.search,
      sort: query.sort,
      method: query.method,
    });
  }

  @Get('business/:id')
  @Roles(UserRole.BUSINESS)
  async getBusinessWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.withdrawalService.findByIdForBusiness(id, business._id.toString());
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.withdrawalService.cancel(id, user.userId);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  approve(
    @Param('id') id: string,
    @Body() dto: ProcessWithdrawalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.withdrawalService.approve(id, dto, user.email);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  reject(@Param('id') id: string, @Body() dto: RejectWithdrawalDto) {
    return this.withdrawalService.reject(id, dto);
  }
}
