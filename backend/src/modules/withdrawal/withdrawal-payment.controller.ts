import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { WithdrawalPaymentService } from './withdrawal-payment.service';
import {
  SubmitWithdrawalPaymentDto,
  RejectWithdrawalPaymentDto,
  DisputeWithdrawalPaymentDto,
  CreditPreviewQueryDto,
  WithdrawalPaymentListQueryDto,
} from './dto/withdrawal-payment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

@Controller('withdrawal-payments')
export class WithdrawalPaymentController {
  constructor(private paymentService: WithdrawalPaymentService) {}

  @Get('available-withdrawals')
  getAvailable(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WithdrawalPaymentListQueryDto,
  ) {
    return this.paymentService.findAvailableForPayment(user.userId, query);
  }

  @Get('credit-preview')
  creditPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CreditPreviewQueryDto,
  ) {
    return this.paymentService.previewCredit(user.userId, query.amount, query.withdrawalId);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentService.getUserDashboardSummary(user.userId);
  }

  @Get('mine')
  getMyPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WithdrawalPaymentListQueryDto,
  ) {
    return this.paymentService.findMyPayments(user.userId, query);
  }

  @Get('business')
  @Roles(UserRole.BUSINESS)
  @Permissions(Permission.BUSINESS_DEPOSIT_VERIFY)
  getBusinessPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WithdrawalPaymentListQueryDto,
  ) {
    return this.paymentService.findForBusinessOwner(user.userId, query);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  getPending(@Query() query: WithdrawalPaymentListQueryDto) {
    return this.paymentService.findPending({
      ...query,
      status: query.status || TransactionStatus.PENDING,
    });
  }

  @Get('all')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  getAll(@Query() query: WithdrawalPaymentListQueryDto) {
    return this.paymentService.findAllPayments(query);
  }

  @Get('withdrawal/:withdrawalId')
  getWithdrawalDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('withdrawalId') withdrawalId: string,
  ) {
    return this.paymentService.findById(withdrawalId, user.userId);
  }

  @Post('withdrawal/:withdrawalId/claim')
  @Roles(
    UserRole.USER,
    UserRole.INVESTOR,
    UserRole.BUSINESS,
    UserRole.ADMIN,
    UserRole.SUB_ADMIN,
  )
  claimWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('withdrawalId') withdrawalId: string,
  ) {
    return this.paymentService.claimWithdrawal(user.userId, withdrawalId);
  }

  @Post('withdrawal/:withdrawalId')
  submitPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('withdrawalId') withdrawalId: string,
    @Body() dto: SubmitWithdrawalPaymentDto,
  ) {
    return this.paymentService.submitPayment(user.userId, withdrawalId, dto);
  }

  @Patch(':id/confirm-received')
  confirmReceived(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentService.confirmReceived(id, user.userId, user.email);
  }

  @Post(':id/dispute')
  raiseDispute(
    @Param('id') id: string,
    @Body() dto: DisputeWithdrawalPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentService.raiseDispute(id, user.userId, user.email, dto);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentService.approvePayment(id, user.email, user.userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WITHDRAWALS_MANAGE)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectWithdrawalPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentService.rejectPayment(id, dto, user.email);
  }
}
