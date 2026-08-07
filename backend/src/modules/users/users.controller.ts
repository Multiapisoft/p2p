import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import {
  UpdateUserDto,
  UserListQueryDto,
  AttachReferralDto,
  SetInvestorPlanDto,
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

  @Patch('me/investor-plan')
  @Roles(UserRole.INVESTOR)
  setInvestorPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetInvestorPlanDto) {
    return this.usersService.setInvestorPlan(user.userId, dto.planAmount);
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
