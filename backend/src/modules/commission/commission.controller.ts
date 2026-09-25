import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { CommissionService } from './commission.service';
import {
  CreateCommissionDto,
  UpdateCommissionDto,
  UpsertBusinessCommissionsDto,
} from './dto/commission.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permission } from '../../common/enums/permission.enum';
import { CommissionTarget } from '../../common/enums/commission-target.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { assertSubAdminBusinessAccess } from '../../common/utils/admin-business-scope.util';

@Controller('commissions')
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
@Permissions(Permission.COMMISSIONS_MANAGE)
export class CommissionController {
  constructor(private commissionService: CommissionService) {}

  @Post()
  create(@Body() dto: CreateCommissionDto) {
    return this.commissionService.create(dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('targetType') targetType?: CommissionTarget,
    @Query('targetId') targetId?: string,
  ) {
    if (targetType) {
      if (targetType === CommissionTarget.BUSINESS && targetId) {
        assertSubAdminBusinessAccess(user.role, user.assignedBusinessIds, targetId);
      }
      return this.commissionService.findForTarget(targetType, targetId);
    }
    return this.commissionService.findAll(user);
  }

  @Get('business/:businessId')
  getBusinessCommissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
  ) {
    assertSubAdminBusinessAccess(user.role, user.assignedBusinessIds, businessId);
    return this.commissionService.getBusinessCommissions(businessId);
  }

  @Post('business/:businessId')
  upsertBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: UpsertBusinessCommissionsDto,
  ) {
    assertSubAdminBusinessAccess(user.role, user.assignedBusinessIds, businessId);
    // Pay-limit changes go through Limit Requests (proof + approval), not commissions.
    delete (dto as { p2pPayLimit?: number }).p2pPayLimit;
    return this.commissionService.upsertBusinessCommissions(businessId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommissionDto) {
    return this.commissionService.update(id, dto);
  }
}
