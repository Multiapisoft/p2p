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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import {
  assertActorBusinessAccess,
  subAdminBusinessIdsOrEmpty,
} from '../../common/utils/admin-business-scope.util';

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
    return this.usersService.setInvestorPlan(user.userId, dto.planAmount);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.USERS_MANAGE)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: UserListQueryDto) {
    return this.usersService.findAll({
      ...query,
      referredByBusinessIds: subAdminBusinessIdsOrEmpty(user),
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.USERS_MANAGE)
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const profile = await this.usersService.findById(id);
    if (user.role === UserRole.SUB_ADMIN) {
      const referred =
        typeof profile.referredByBusiness === 'object' && profile.referredByBusiness
          ? (profile.referredByBusiness as { _id?: string })._id?.toString() ||
            String(profile.referredByBusiness)
          : profile.referredByBusiness?.toString();
      assertActorBusinessAccess(user, referred || null);
    }
    return profile;
  }
}
