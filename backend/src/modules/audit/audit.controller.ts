import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { AuditListQueryDto } from './dto/audit.dto';

@Controller('audit')
@Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
@Permissions(Permission.AUDIT_VIEW)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  findAll(@Query() query: AuditListQueryDto) {
    return this.auditService.findAll(query);
  }
}
