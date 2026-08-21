import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';
import {
  CreateWithdrawalDto,
  ProcessWithdrawalDto,
  RejectWithdrawalDto,
  RejectP2pListDto,
  AssignWithdrawalDto,
  UpdateWithdrawalDestinationDto,
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

  @Post('platform')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  createPlatformCommissionWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalDto,
  ) {
    return this.withdrawalService.createForPlatform(user.email, dto);
  }

  @Post('business')
  @Roles(UserRole.BUSINESS)
  @Permissions(Permission.BUSINESS_MANUAL_WITHDRAWAL)
  createBusinessWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalDto,
  ) {
    return this.withdrawalService.createForBusiness(user.userId, dto);
  }

  @Get('business')
  @Roles(UserRole.BUSINESS)
  @Permissions(Permission.BUSINESS_WITHDRAWALS)
  async getBusinessWithdrawals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WithdrawalListQueryDto,
  ) {
    const business = await this.businessService.findForActor(user.userId);
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
  @Permissions(Permission.BUSINESS_WITHDRAWALS)
  async getBusinessWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const business = await this.businessService.findForActor(user.userId);
    return this.withdrawalService.findByIdForBusiness(id, business._id.toString());
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.withdrawalService.cancel(id, user.userId);
  }

  @Patch(':id/destination')
  updateDestination(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWithdrawalDestinationDto,
  ) {
    return this.withdrawalService.updateDestination(id, user.userId, dto);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.BUSINESS)
  async approve(
    @Param('id') id: string,
    @Body() dto: ProcessWithdrawalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Business-linked withdrawals: only owning business can approve.
    // Admin may only approve withdrawals with no business owner.
    if (user.role === UserRole.BUSINESS) {
      await this.businessService.assertStaffCan(user.userId, Permission.BUSINESS_WITHDRAWALS);
      const business = await this.businessService.findForActor(user.userId);
      return this.withdrawalService.approveForBusiness(
        id,
        business._id.toString(),
        dto,
        user.email,
      );
    }
    return this.withdrawalService.approveAsAdmin(id, dto, user.email);
  }

  @Patch(':id/list-for-p2p')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.BUSINESS)
  async listForP2p(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === UserRole.BUSINESS) {
      await this.businessService.assertStaffCan(user.userId, Permission.BUSINESS_WITHDRAWALS);
    }
    return this.withdrawalService.listForP2p(id, {
      userId: user.userId,
      email: user.email,
      role: user.role,
    });
  }

  @Patch(':id/unlist-for-p2p')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.BUSINESS)
  async unlistForP2p(
    @Param('id') id: string,
    @Body() dto: RejectP2pListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.BUSINESS) {
      await this.businessService.assertStaffCan(user.userId, Permission.BUSINESS_WITHDRAWALS);
    }
    return this.withdrawalService.rejectP2pList(
      id,
      { userId: user.userId, email: user.email, role: user.role },
      dto.reason,
    );
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.BUSINESS)
  async assignPayer(
    @Param('id') id: string,
    @Body() dto: AssignWithdrawalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.BUSINESS) {
      await this.businessService.assertStaffCan(user.userId, Permission.BUSINESS_WITHDRAWALS);
    }
    return this.withdrawalService.assignPayer(id, dto.assigneeId, {
      userId: user.userId,
      email: user.email,
      role: user.role,
    });
  }

  @Patch(':id/unassign')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.BUSINESS)
  async unassignPayer(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === UserRole.BUSINESS) {
      await this.businessService.assertStaffCan(user.userId, Permission.BUSINESS_WITHDRAWALS);
    }
    return this.withdrawalService.unassignPayer(id, {
      userId: user.userId,
      email: user.email,
      role: user.role,
    });
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.BUSINESS)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectWithdrawalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.role === UserRole.BUSINESS) {
      await this.businessService.assertStaffCan(user.userId, Permission.BUSINESS_WITHDRAWALS);
      const business = await this.businessService.findForActor(user.userId);
      return this.withdrawalService.rejectForBusiness(
        id,
        business._id.toString(),
        dto,
      );
    }
    return this.withdrawalService.rejectAsAdmin(id, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  getAdminDetail(@Param('id') id: string) {
    return this.withdrawalService.findByIdForAdmin(id);
  }
}
