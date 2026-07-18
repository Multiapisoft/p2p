import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateSubAdminDto, UpdateUserStatusDto } from './dto/admin.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Post('sub-admins')
  @Roles(UserRole.ADMIN)
  createSubAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubAdminDto,
  ) {
    return this.adminService.createSubAdmin(dto, user.userId);
  }

  @Get('sub-admins')
  @Roles(UserRole.ADMIN)
  listSubAdmins(@Query() pagination: PaginationDto) {
    return this.adminService.listSubAdmins(pagination.page, pagination.limit);
  }

  @Patch('users/:id/status')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.USERS_MANAGE)
  updateUserStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.adminService.updateUserStatus(id, dto.status);
  }
}
