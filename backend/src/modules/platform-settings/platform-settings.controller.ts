import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';

@Controller('platform-settings')
export class PlatformSettingsController {
  constructor(private platformSettingsService: PlatformSettingsService) {}

  /** Authenticated roles can read timers/plan defaults for UI countdowns. */
  @Get()
  get() {
    return this.platformSettingsService.get();
  }

  @Patch()
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.PLATFORM_SETTINGS_MANAGE)
  update(@Body() dto: UpdatePlatformSettingsDto) {
    return this.platformSettingsService.update(dto);
  }
}
