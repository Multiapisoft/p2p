import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessListQueryDto, CreateBusinessDto, UpdateBusinessDto } from './dto/business.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentBusiness } from '../../common/decorators/current-business.decorator';
import type { BusinessDocument } from './schemas/business.schema';
import { Public } from '../../common/decorators/public.decorator';
import { UsersService } from '../users/users.service';
import { WebhookService } from '../webhook/webhook.service';
import { IntegrationConfigService } from '../integration/integration-config.service';
import { UpdateIntegrationUrlsDto } from './dto/integration-urls.dto';
import { UpdatePartnerApiDto } from './dto/partner-api.dto';
import { UserListQueryDto } from '../users/dto/create-user.dto';

@Controller('business')
export class BusinessController {
  constructor(
    private businessService: BusinessService,
    private usersService: UsersService,
    private webhookService: WebhookService,
    private integrationConfigService: IntegrationConfigService,
  ) {}

  @Post()
  @Roles(UserRole.BUSINESS, UserRole.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBusinessDto) {
    return this.businessService.create(user.userId, dto);
  }

  @Get('me')
  @Roles(UserRole.BUSINESS)
  getMyBusiness(@CurrentUser() user: AuthenticatedUser) {
    return this.businessService.findByOwner(user.userId);
  }

  @Patch('me')
  @Roles(UserRole.BUSINESS)
  updateMyBusiness(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBusinessDto) {
    return this.businessService.update(user.userId, dto);
  }

  @Post('me/regenerate-keys')
  @Roles(UserRole.BUSINESS)
  regenerateKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.businessService.regenerateKeys(user.userId);
  }

  @Post('me/regenerate-internal-keys')
  @Roles(UserRole.BUSINESS)
  regenerateInternalKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.businessService.regenerateInternalKeys(user.userId);
  }

  @Get('me/stats')
  @Roles(UserRole.BUSINESS)
  async getMyStats(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.businessService.getStats(business._id.toString());
  }

  @Get('me/users')
  @Roles(UserRole.BUSINESS)
  async getMyUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UserListQueryDto,
  ) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.usersService.findByBusiness(business._id.toString(), query);
  }

  @Post('me/webhook/test')
  @Roles(UserRole.BUSINESS)
  async testMyWebhook(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.businessService.findByOwner(user.userId);
    return this.webhookService.testWebhook(business);
  }

  @Get('me/integration/config')
  @Roles(UserRole.BUSINESS)
  async getIntegrationConfig(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.businessService.findDocumentByOwner(user.userId);
    return this.integrationConfigService.buildForBusiness(business);
  }

  @Patch('me/integration-urls')
  @Roles(UserRole.BUSINESS)
  async updateIntegrationUrls(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateIntegrationUrlsDto,
  ) {
    return this.businessService.updateIntegrationUrls(user.userId, dto.integrationUrls);
  }

  @Get('me/partner-api')
  @Roles(UserRole.BUSINESS)
  getPartnerApi(@CurrentUser() user: AuthenticatedUser) {
    return this.businessService.getPartnerApiForOwner(user.userId);
  }

  @Patch('me/partner-api')
  @Roles(UserRole.BUSINESS)
  updatePartnerApi(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePartnerApiDto) {
    return this.businessService.updatePartnerApi(user.userId, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  findAll(@Query() query: BusinessListQueryDto) {
    return this.businessService.findAll(query);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  approve(@Param('id') id: string) {
    return this.businessService.approve(id);
  }

  @Get(':id/stats')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  getStats(@Param('id') id: string) {
    return this.businessService.getStats(id);
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('integration/verify')
  verifyIntegration(@CurrentBusiness() business: BusinessDocument) {
    return {
      verified: true,
      businessId: business._id,
      name: business.name,
      allowedPaymentMethods: business.allowedPaymentMethods,
    };
  }
}
