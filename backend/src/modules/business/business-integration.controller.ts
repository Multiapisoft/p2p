import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import { UsersService } from '../users/users.service';
import { DepositService } from '../deposit/deposit.service';
import { WebhookService } from '../webhook/webhook.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { InternalKeyGuard } from '../../common/guards/internal-key.guard';
import { CurrentBusiness } from '../../common/decorators/current-business.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { BusinessDocument } from './schemas/business.schema';
import { PartnerApiService } from '../integration/partner-api.service';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';
import { IntegrationRegisterUserDto, LinkExternalRefDto } from './dto/integration.dto';
import { UserListQueryDto } from '../users/dto/create-user.dto';
import {
  CreateRedirectDto,
  CreatePortalRedirectDto,
} from '../integration/dto/integration-redirect.dto';
import { IntegrationRedirectService } from '../integration/integration-redirect.service';
import { IntegrationUserWalletService } from '../integration/integration-user-wallet.service';
import { IntegrationWalletAdjustDto } from '../integration/dto/integration-wallet.dto';
import { IntegrationConfigService } from '../integration/integration-config.service';

@Controller('integration')
@Public()
@UseGuards(ApiKeyGuard)
export class BusinessIntegrationController {
  constructor(
    private businessService: BusinessService,
    private usersService: UsersService,
    private depositService: DepositService,
    private webhookService: WebhookService,
    private redirectService: IntegrationRedirectService,
    private userWalletService: IntegrationUserWalletService,
    private configService: IntegrationConfigService,
    private partnerApiService: PartnerApiService,
  ) {}

  @Get('config')
  @UseGuards(InternalKeyGuard)
  getConfig(@CurrentBusiness() business: BusinessDocument) {
    return this.configService.buildForBusiness(business);
  }

  @Get('verify')
  verify(@CurrentBusiness() business: BusinessDocument) {
    const config = this.configService.buildForBusiness(business);
    return {
      verified: true,
      businessId: business._id,
      name: business.name,
      allowedPaymentMethods: business.allowedPaymentMethods,
      referralCode: business.referralCode,
      integrationUrls: business.integrationUrls,
      partnerSite: config.partnerSite,
      endpoints: config.endpoints,
      userPanelUrl: config.userPanelUrl,
      requiresInternalSecret: !!business.internalSecretHash,
    };
  }

  @Post('users')
  async registerUser(
    @CurrentBusiness() business: BusinessDocument,
    @Body() dto: IntegrationRegisterUserDto,
  ) {
    const user = await this.usersService.createForBusiness(business._id.toString(), dto);
    if (user.created) {
      await this.webhookService.dispatch(business._id.toString(), 'user.registered', {
        userId: user.userId,
        email: user.email,
        name: user.name,
        externalRef: user.externalRef,
      });
    }
    return {
      userId: user.userId,
      businessId: business._id.toString(),
      created: user.created,
      user,
    };
  }

  @Get('users')
  async listUsers(
    @CurrentBusiness() business: BusinessDocument,
    @Query() query: UserListQueryDto,
  ) {
    return this.usersService.findByBusiness(business._id.toString(), query);
  }

  @Get('users/lookup')
  @UseGuards(InternalKeyGuard)
  async lookupUser(
    @CurrentBusiness() business: BusinessDocument,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
    @Query('externalRef') externalRef?: string,
  ) {
    const found = await this.usersService.resolveForBusiness(business._id.toString(), {
      email,
      userId,
      externalRef,
    });
    return this.buildUserBalanceResponse(business, found);
  }

  @Get('users/:userId')
  @UseGuards(InternalKeyGuard)
  async getUser(
    @CurrentBusiness() business: BusinessDocument,
    @Param('userId') userId: string,
  ) {
    const found = await this.usersService.findByIdForBusiness(
      business._id.toString(),
      userId,
    );
    return this.buildUserBalanceResponse(business, found);
  }

  private async buildUserBalanceResponse(
    business: BusinessDocument,
    found: Record<string, unknown> & {
      userId: string;
      email: string;
      externalRef?: string;
      partnerUserId?: string;
    },
  ) {
    const email = found.email;
    // Prefer partner platform id (from externalRef), not P2P's own userId
    const partnerUserId =
      found.partnerUserId || partnerUserIdFromExternalRef(found.externalRef);

    let partnerBalance = null;
    if (this.partnerApiService.isConfigured(business)) {
      try {
        partnerBalance = await this.partnerApiService.fetchBalance(business, {
          email,
          userId: partnerUserId,
        });
      } catch {
        // Partner downtime should not break lookup / register / portal launch
        partnerBalance = null;
      }
    }

    const finguardBalance = await this.userWalletService.getUserBalance(
      business._id.toString(),
      found.userId,
    );

    return {
      user: found,
      partnerBalance,
      balance: partnerBalance ?? finguardBalance,
      finguardBalance,
    };
  }

  @Patch('users/:userId/external-ref')
  @UseGuards(InternalKeyGuard)
  linkExternalRef(
    @CurrentBusiness() business: BusinessDocument,
    @Param('userId') userId: string,
    @Body() dto: LinkExternalRefDto,
  ) {
    return this.usersService.ensureExternalRefForBusiness(
      business._id.toString(),
      userId,
      dto.externalRef,
    );
  }

  @Get('deposits/:referenceId')
  getDeposit(
    @CurrentBusiness() business: BusinessDocument,
    @Param('referenceId') referenceId: string,
  ) {
    return this.depositService.findByReferenceForBusiness(
      business._id.toString(),
      referenceId,
    );
  }

  @Post('webhook/test')
  testWebhook(@CurrentBusiness() business: BusinessDocument) {
    return this.webhookService.testWebhook(business);
  }

  @Post('redirect/deposit')
  @UseGuards(InternalKeyGuard)
  createDepositRedirect(
    @CurrentBusiness() business: BusinessDocument,
    @Body() dto: CreateRedirectDto,
  ) {
    return this.redirectService.createDepositRedirect(business, dto);
  }

  @Post('redirect/withdrawal')
  @UseGuards(InternalKeyGuard)
  createWithdrawalRedirect(
    @CurrentBusiness() business: BusinessDocument,
    @Body() dto: CreateRedirectDto,
  ) {
    return this.redirectService.createWithdrawalRedirect(business, dto);
  }

  @Post('redirect/portal')
  @UseGuards(InternalKeyGuard)
  createPortalRedirect(
    @CurrentBusiness() business: BusinessDocument,
    @Body() dto: CreatePortalRedirectDto,
  ) {
    return this.redirectService.createPortalRedirect(business, dto);
  }

  @Get('users/:userId/balance')
  @UseGuards(InternalKeyGuard)
  async getUserBalance(
    @CurrentBusiness() business: BusinessDocument,
    @Param('userId') userId: string,
  ) {
    const found = await this.usersService.findByIdForBusiness(
      business._id.toString(),
      userId,
    );
    return this.buildUserBalanceResponse(business, found);
  }

  @Post('users/:userId/credit')
  @UseGuards(InternalKeyGuard)
  creditUser(
    @CurrentBusiness() business: BusinessDocument,
    @Param('userId') userId: string,
    @Body() dto: IntegrationWalletAdjustDto,
  ) {
    return this.userWalletService.creditUser(
      business,
      userId,
      dto.amount,
      dto.externalRef,
      dto.reason,
    );
  }

  @Post('users/:userId/debit')
  @UseGuards(InternalKeyGuard)
  debitUser(
    @CurrentBusiness() business: BusinessDocument,
    @Param('userId') userId: string,
    @Body() dto: IntegrationWalletAdjustDto,
  ) {
    return this.userWalletService.debitUser(
      business,
      userId,
      dto.amount,
      dto.externalRef,
      dto.reason,
    );
  }

  @Patch('deposits/:referenceId/cancel')
  @UseGuards(InternalKeyGuard)
  cancelDeposit(
    @CurrentBusiness() business: BusinessDocument,
    @Param('referenceId') referenceId: string,
  ) {
    return this.userWalletService.cancelDeposit(business._id.toString(), referenceId);
  }

  @Patch('withdrawals/:referenceId/cancel')
  @UseGuards(InternalKeyGuard)
  cancelWithdrawal(
    @CurrentBusiness() business: BusinessDocument,
    @Param('referenceId') referenceId: string,
  ) {
    return this.userWalletService.cancelWithdrawal(business._id.toString(), referenceId);
  }
}
