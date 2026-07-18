import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { PaymentConfigService } from './payment-config.service';
import { CreatePaymentConfigDto, UpdatePaymentConfigDto } from './dto/payment-config.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { Public } from '../../common/decorators/public.decorator';

@Controller('payment-config')
export class PaymentConfigController {
  constructor(private paymentConfigService: PaymentConfigService) {}

  @Public()
  @Get('active')
  getActive() {
    return this.paymentConfigService.findActive();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.PAYMENT_CONFIG_MANAGE)
  findAll() {
    return this.paymentConfigService.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @Permissions(Permission.PAYMENT_CONFIG_MANAGE)
  create(@Body() dto: CreatePaymentConfigDto) {
    return this.paymentConfigService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @Permissions(Permission.PAYMENT_CONFIG_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdatePaymentConfigDto) {
    return this.paymentConfigService.update(id, dto);
  }
}
