import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { InvestorService } from './investor.service';
import {
  CreateRedemptionDto,
  CreateInvestmentDto,
  ProcessRedemptionDto,
  RejectRedemptionDto,
  InvestorListQueryDto,
} from './dto/investor.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

@Controller('investor')
export class InvestorController {
  constructor(private investorService: InvestorService) {}

  @Get('portfolio')
  @Roles(UserRole.INVESTOR)
  getPortfolio(@CurrentUser() user: AuthenticatedUser) {
    return this.investorService.getRedeemableInfo(user.userId);
  }

  @Get('redeemable')
  @Roles(UserRole.INVESTOR)
  getRedeemable(@CurrentUser() user: AuthenticatedUser) {
    return this.investorService.getRedeemableInfo(user.userId);
  }

  @Post('invest')
  @Roles(UserRole.INVESTOR)
  requestInvestment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvestmentDto) {
    return this.investorService.requestInvestment(user.userId, dto);
  }

  @Get('investments')
  @Roles(UserRole.INVESTOR)
  getMyInvestments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InvestorListQueryDto,
  ) {
    return this.investorService.findInvestmentsByInvestor(user.userId, query);
  }

  @Get('investments/pending')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  getPendingInvestments(@Query() query: InvestorListQueryDto) {
    return this.investorService.findPendingInvestments({
      ...query,
      status: query.status || TransactionStatus.PENDING,
    });
  }

  @Get('investments/all')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  getAllInvestments(@Query() query: InvestorListQueryDto) {
    return this.investorService.findInvestments(query);
  }

  @Get('payments')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  getInvestorPayments(@Query() query: InvestorListQueryDto) {
    return this.investorService.findInvestorPayments(query);
  }

  @Patch('investments/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  approveInvestment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.investorService.approveInvestment(id, user.email, user.userId);
  }

  @Patch('investments/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  rejectInvestment(@Param('id') id: string, @Body() dto: RejectRedemptionDto) {
    return this.investorService.rejectInvestment(id, dto);
  }

  @Post('redeem')
  @Roles(UserRole.INVESTOR)
  requestRedemption(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRedemptionDto) {
    return this.investorService.requestRedemption(user.userId, dto);
  }

  @Get('redemptions')
  @Roles(UserRole.INVESTOR)
  getMyRedemptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InvestorListQueryDto,
  ) {
    return this.investorService.findByInvestor(user.userId, query);
  }

  @Get('redemptions/pending')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  getPending(@Query() query: InvestorListQueryDto) {
    return this.investorService.findPending({
      ...query,
      status: query.status || TransactionStatus.PENDING,
    });
  }

  @Patch('redemptions/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  approve(
    @Param('id') id: string,
    @Body() dto: ProcessRedemptionDto = {},
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.investorService.approve(id, dto, user.email);
  }

  @Patch('redemptions/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.INVESTORS_MANAGE)
  reject(@Param('id') id: string, @Body() dto: RejectRedemptionDto) {
    return this.investorService.reject(id, dto);
  }
}
