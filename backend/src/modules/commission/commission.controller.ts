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
    @Query('targetType') targetType?: CommissionTarget,
    @Query('targetId') targetId?: string,
  ) {
    if (targetType) {
      return this.commissionService.findForTarget(targetType, targetId);
    }
    return this.commissionService.findAll();
  }

  @Get('business/:businessId')
  getBusinessCommissions(@Param('businessId') businessId: string) {
    return this.commissionService.getBusinessCommissions(businessId);
  }

  @Post('business/:businessId')
  upsertBusiness(
    @Param('businessId') businessId: string,
    @Body() dto: UpsertBusinessCommissionsDto,
  ) {
    return this.commissionService.upsertBusinessCommissions(businessId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommissionDto) {
    return this.commissionService.update(id, dto);
  }
}
