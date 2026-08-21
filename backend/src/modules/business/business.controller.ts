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
import { BusinessListQueryDto, CreateBusinessDto, UpdateBusinessDto, SetP2pPayLimitDto } from './dto/business.dto';
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
import {
  UserListQueryDto,
  BusinessSetUserPasswordDto,
  BusinessSetUserCodeDto,
  CreateBusinessStaffDto,
  UpdateBusinessStaffDto,
} from '../users/dto/create-user.dto';

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
    return this.businessService.findForActor(user.userId);
  }

  @Patch('me')
  @Roles(UserRole.BUSINESS)
  async updateMyBusiness(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBusinessDto) {
    await this.businessService.assertActorIsOwner(user.userId);
    return this.businessService.update(user.userId, dto);
  }

  @Post('me/regenerate-keys')
  @Roles(UserRole.BUSINESS)
  async regenerateKeys(@CurrentUser() user: AuthenticatedUser) {
    await this.businessService.assertActorIsOwner(user.userId);
    return this.businessService.regenerateKeys(user.userId);
  }

  @Post('me/regenerate-internal-keys')
  @Roles(UserRole.BUSINESS)
  async regenerateInternalKeys(@CurrentUser() user: AuthenticatedUser) {
    await this.businessService.assertActorIsOwner(user.userId);
    return this.businessService.regenerateInternalKeys(user.userId);
  }

  @Get('me/stats')
  @Roles(UserRole.BUSINESS)
  async getMyStats(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.businessService.findForActor(user.userId);
    return this.businessService.getStats(business._id.toString());
  }

  @Get('me/staff')
  @Roles(UserRole.BUSINESS)
  listStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listBusinessStaff(user.userId);
  }

  @Post('me/staff')
  @Roles(UserRole.BUSINESS)
  createStaff(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBusinessStaffDto) {
    return this.usersService.createBusinessStaff(user.userId, dto);
  }

  @Patch('me/staff/:staffId')
  @Roles(UserRole.BUSINESS)
  updateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateBusinessStaffDto,
  ) {
    return this.usersService.updateBusinessStaff(user.userId, staffId, dto);
  }

  @Get('me/users')
  @Roles(UserRole.BUSINESS)
  async getMyUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UserListQueryDto,
  ) {
    const business = await this.businessService.findForActor(user.userId);
    return this.usersService.findByBusiness(business._id.toString(), query);
  }

  @Patch('me/users/:userId/password')
  @Roles(UserRole.BUSINESS)
  async setUserPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: BusinessSetUserPasswordDto,
  ) {
    const business = await this.businessService.findForActor(user.userId);
    return this.usersService.setPasswordForBusinessUser(
      business._id.toString(),
      userId,
      dto.newPassword,
    );
  }

  @Patch('me/users/:userId/code')
  @Roles(UserRole.BUSINESS)
  async setUserCode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: BusinessSetUserCodeDto,
  ) {
    const business = await this.businessService.findForActor(user.userId);
    return this.usersService.setBusinessUserCode(
      business._id.toString(),
      userId,
      dto.code,
    );
  }

  @Post('me/webhook/test')
  @Roles(UserRole.BUSINESS)
  async testMyWebhook(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.businessService.findForActor(user.userId);
    return this.webhookService.testWebhook(business);
  }

  @Get('me/integration/config')
  @Roles(UserRole.BUSINESS)
  async getIntegrationConfig(@CurrentUser() user: AuthenticatedUser) {
    await this.businessService.assertActorIsOwner(user.userId);
    const business = await this.businessService.findDocumentByOwner(user.userId);
    return this.integrationConfigService.buildForBusiness(business);
  }

  @Patch('me/integration-urls')
  @Roles(UserRole.BUSINESS)
  async updateIntegrationUrls(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateIntegrationUrlsDto,
  ) {
    await this.businessService.assertActorIsOwner(user.userId);
    return this.businessService.updateIntegrationUrls(user.userId, dto.integrationUrls);
  }

  @Get('me/partner-api')
  @Roles(UserRole.BUSINESS)
  async getPartnerApi(@CurrentUser() user: AuthenticatedUser) {
    await this.businessService.assertActorIsOwner(user.userId);
    return this.businessService.getPartnerApiForOwner(user.userId);
  }

  @Patch('me/partner-api')
  @Roles(UserRole.BUSINESS)
  async updatePartnerApi(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePartnerApiDto) {
    await this.businessService.assertActorIsOwner(user.userId);
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

  @Patch(':id/p2p-pay-limit')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  setP2pPayLimit(@Param('id') id: string, @Body() dto: SetP2pPayLimitDto) {
    return this.businessService.setP2pPayLimit(id, dto.p2pPayLimit);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  updateByAdmin(@Param('id') id: string, @Body() dto: UpdateBusinessDto) {
    return this.businessService.updateByAdmin(id, dto);
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
