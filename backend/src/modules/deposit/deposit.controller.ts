import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DepositService } from './deposit.service';
import {
  CreateDepositDto,
  ApproveDepositDto,
  RejectDepositDto,
  IntegrationCreateDepositDto,
  DepositListQueryDto,
} from './dto/deposit.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { InternalKeyGuard } from '../../common/guards/internal-key.guard';
import { CurrentBusiness } from '../../common/decorators/current-business.decorator';
import type { BusinessDocument } from '../business/schemas/business.schema';
import { BusinessService } from '../business/business.service';
import { Public } from '../../common/decorators/public.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

@Controller('deposits')
export class DepositController {
  constructor(
    private depositService: DepositService,
    private businessService: BusinessService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepositDto) {
    return this.depositService.create(user.userId, dto);
  }

  @Public()
  @Post('integration')
  @UseGuards(ApiKeyGuard, InternalKeyGuard)
  createViaApi(
    @CurrentBusiness() business: BusinessDocument,
    @Body() dto: IntegrationCreateDepositDto,
  ) {
    return this.depositService.create(dto.userId, dto, business);
  }

  @Get()
  getMyDeposits(@CurrentUser() user: AuthenticatedUser, @Query() query: DepositListQueryDto) {
    return this.depositService.findByUser(user.userId, query);
  }

  @Get('all')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.DEPOSITS_MANAGE)
  getAll(@Query() query: DepositListQueryDto) {
    return this.depositService.findAll(query);
  }

  @Get('business')
  @Roles(UserRole.BUSINESS)
  async getBusinessDeposits(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DepositListQueryDto,
  ) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.depositService.findByBusiness(business._id.toString(), query);
  }

  @Get('business/summary')
  @Roles(UserRole.BUSINESS)
  async getBusinessSummary(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.depositService.getBusinessDepositSummary(business._id.toString());
  }

  @Get('business/overview')
  @Roles(UserRole.BUSINESS)
  async getBusinessOverview(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.depositService.getBusinessOverview(business._id.toString());
  }

  @Get('business/:id')
  @Roles(UserRole.BUSINESS)
  async getBusinessDeposit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.depositService.findByIdForBusiness(id, business._id.toString());
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.DEPOSITS_MANAGE)
  getPending(@Query() query: DepositListQueryDto) {
    return this.depositService.findPending(query);
  }

  @Get('investor')
  @Roles(UserRole.INVESTOR)
  getForInvestor(@Query() query: DepositListQueryDto) {
    return this.depositService.findAll(query);
  }

  @Get('investor/summary')
  @Roles(UserRole.INVESTOR)
  getInvestorSummary(@Query('status') status?: TransactionStatus) {
    return this.depositService.getMethodSummary(status);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const isStaff = user.role === UserRole.ADMIN || user.role === UserRole.SUB_ADMIN;
    return this.depositService.findById(id, isStaff ? undefined : user.userId);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.depositService.cancel(id, user.userId);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.DEPOSITS_MANAGE)
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveDepositDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.depositService.approve(id, dto, user.email, user.userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.DEPOSITS_MANAGE)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDepositDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.depositService.reject(id, dto, user.email, user.userId);
  }
}
