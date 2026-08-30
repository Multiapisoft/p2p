import { Controller, Get, Patch, Post, Param, Body, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  UpdateUserDto,
  UserListQueryDto,
  AttachReferralDto,
  SetInvestorPlanDto,
  AddInvestorLimitDto,
  UpsertSavedWithdrawalMethodDto,
} from './dto/create-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.userId);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.userId, dto);
  }

  @Patch('me/referral')
  attachReferral(@CurrentUser() user: AuthenticatedUser, @Body() dto: AttachReferralDto) {
    return this.usersService.attachReferral(user.userId, dto.referralCode);
  }

  @Get('me/referral-team')
  @Roles(UserRole.INVESTOR)
  getReferralTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UserListQueryDto,
  ) {
    return this.usersService.getReferralTeam(user.userId, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      sort: query.sort,
    });
  }

  @Get('me/withdrawal-methods')
  getSavedWithdrawalMethods(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getSavedWithdrawalMethods(user.userId);
  }

  @Post('me/withdrawal-methods')
  saveWithdrawalMethod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertSavedWithdrawalMethodDto,
  ) {
    return this.usersService.saveWithdrawalMethod(user.userId, dto);
  }

  @Patch('me/withdrawal-methods/:methodId')
  updateSavedWithdrawalMethod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('methodId') methodId: string,
    @Body() dto: UpsertSavedWithdrawalMethodDto,
  ) {
    return this.usersService.saveWithdrawalMethod(user.userId, dto, methodId);
  }

  @Patch('me/withdrawal-methods/:methodId/default')
  setDefaultWithdrawalMethod(@CurrentUser() user: AuthenticatedUser, @Param('methodId') methodId: string) {
    return this.usersService.setDefaultWithdrawalMethod(user.userId, methodId);
  }

  @Post('me/withdrawal-methods/:methodId/delete')
  deleteSavedWithdrawalMethod(@CurrentUser() user: AuthenticatedUser, @Param('methodId') methodId: string) {
    return this.usersService.deleteSavedWithdrawalMethod(user.userId, methodId);
  }

  @Post('me/investor-limit')
  @Roles(UserRole.INVESTOR)
  addInvestorLimit(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddInvestorLimitDto) {
    return this.usersService.addInvestorLimit(user.userId, dto.amount);
  }

  @Get('me/investor-limit')
  @Roles(UserRole.INVESTOR)
  getInvestorLimit(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getInvestorLimit(user.userId);
  }

  @Patch('me/investor-plan')
  @Roles(UserRole.INVESTOR)
  setInvestorPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetInvestorPlanDto) {
    return this.usersService.addInvestorLimit(user.userId, dto.planAmount);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  findAll(@Query() query: UserListQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
