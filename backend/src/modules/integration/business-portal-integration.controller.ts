import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { BusinessService } from '../business/business.service';
import { UsersService } from '../users/users.service';
import { IntegrationUserWalletService } from './integration-user-wallet.service';
import { IntegrationRedirectService } from './integration-redirect.service';
import { IntegrationConfigService } from './integration-config.service';
import { PartnerApiService } from './partner-api.service';
import { IntegrationWalletAdjustDto } from './dto/integration-wallet.dto';
import { CreateRedirectDto, CreatePortalRedirectDto } from './dto/integration-redirect.dto';
import { partnerUserIdFromExternalRef } from './utils/partner-user-id.util';

@Controller('business/me/integration')
@Roles(UserRole.BUSINESS)
export class BusinessPortalIntegrationController {
  constructor(
    private businessService: BusinessService,
    private usersService: UsersService,
    private walletService: IntegrationUserWalletService,
    private redirectService: IntegrationRedirectService,
    private configService: IntegrationConfigService,
    private partnerApiService: PartnerApiService,
  ) {}

  private getBusinessDoc(user: AuthenticatedUser) {
    return this.businessService.findDocumentByOwner(user.userId);
  }

  @Get('config')
  async getConfig(@CurrentUser() user: AuthenticatedUser) {
    const business = await this.getBusinessDoc(user);
    return this.configService.buildForBusiness(business);
  }

  @Get('partner-balance')
  async getPartnerBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email: string,
  ) {
    if (!email?.trim()) {
      throw new BadRequestException('email query parameter is required');
    }
    const business = await this.getBusinessDoc(user);
    return this.partnerApiService.fetchBalanceByEmail(business, email);
  }

  @Get('users/lookup')
  async lookupUser(
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
    @Query('externalRef') externalRef?: string,
  ) {
    const business = await this.getBusinessDoc(user);
    const found = await this.usersService.resolveForBusiness(business._id.toString(), {
      email,
      userId,
      externalRef,
    });
    return this.buildUserBalanceResponse(business, found);
  }

  @Get('users/:userId')
  async getUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    const business = await this.getBusinessDoc(user);
    const found = await this.usersService.findByIdForBusiness(
      business._id.toString(),
      userId,
    );
    return this.buildUserBalanceResponse(business, found);
  }

  private async buildUserBalanceResponse(
    business: Awaited<ReturnType<BusinessService['findDocumentByOwner']>>,
    found: Record<string, unknown> & {
      userId: string;
      email: string;
      externalRef?: string;
      partnerUserId?: string;
    },
  ) {
    const partnerUserId =
      found.partnerUserId || partnerUserIdFromExternalRef(found.externalRef);

    let partnerBalance = null;
    if (this.partnerApiService.isConfigured(business)) {
      try {
        partnerBalance = await this.partnerApiService.fetchBalance(business, {
          email: found.email,
          userId: partnerUserId,
        });
      } catch {
        partnerBalance = null;
      }
    }

    const finguardBalance = await this.walletService.getUserBalance(
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

  @Get('users/:userId/balance')
  async getUserBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    const business = await this.getBusinessDoc(user);
    const found = await this.usersService.findByIdForBusiness(
      business._id.toString(),
      userId,
    );
    return this.buildUserBalanceResponse(business, found);
  }

  @Post('users/:userId/credit')
  async creditUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: IntegrationWalletAdjustDto,
  ) {
    const business = await this.getBusinessDoc(user);
    const found = await this.usersService.findByIdForBusiness(
      business._id.toString(),
      userId,
    );
    const email = found.email as string;
    const partnerUserId =
      (found.partnerUserId as string | undefined) ||
      partnerUserIdFromExternalRef(found.externalRef as string | undefined);

    if (this.partnerApiService.isConfigured(business)) {
      await this.partnerApiService.creditPartner(
        business,
        email,
        dto.amount,
        dto.reason,
        partnerUserId,
      );
      const partnerBalance = await this.partnerApiService.fetchBalance(
        business,
        { email, userId: partnerUserId },
      );
      return { partnerBalance, success: true };
    }

    return this.walletService.creditUser(
      business,
      userId,
      dto.amount,
      dto.externalRef,
      dto.reason,
    );
  }

  @Post('users/:userId/debit')
  async debitUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: IntegrationWalletAdjustDto,
  ) {
    const business = await this.getBusinessDoc(user);
    const found = await this.usersService.findByIdForBusiness(
      business._id.toString(),
      userId,
    );
    const email = found.email as string;
    const partnerUserId =
      (found.partnerUserId as string | undefined) ||
      partnerUserIdFromExternalRef(found.externalRef as string | undefined);

    if (this.partnerApiService.isConfigured(business)) {
      await this.partnerApiService.debitPartner(
        business,
        email,
        dto.amount,
        dto.reason,
        partnerUserId,
      );
      const partnerBalance = await this.partnerApiService.fetchBalance(
        business,
        { email, userId: partnerUserId },
      );
      return { partnerBalance, success: true };
    }

    return this.walletService.debitUser(
      business,
      userId,
      dto.amount,
      dto.externalRef,
      dto.reason,
    );
  }

  @Post('redirect/deposit')
  async depositRedirect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRedirectDto,
  ) {
    const business = await this.getBusinessDoc(user);
    return this.redirectService.createDepositRedirect(business, dto);
  }

  @Post('redirect/withdrawal')
  async withdrawalRedirect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRedirectDto,
  ) {
    const business = await this.getBusinessDoc(user);
    return this.redirectService.createWithdrawalRedirect(business, dto);
  }

  @Post('redirect/portal')
  async portalRedirect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePortalRedirectDto,
  ) {
    const business = await this.getBusinessDoc(user);
    return this.redirectService.createPortalRedirect(business, dto);
  }

  @Patch('deposits/:referenceId/cancel')
  async cancelDeposit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('referenceId') referenceId: string,
  ) {
    const business = await this.getBusinessDoc(user);
    return this.walletService.cancelDeposit(business._id.toString(), referenceId);
  }

  @Patch('withdrawals/:referenceId/cancel')
  async cancelWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('referenceId') referenceId: string,
  ) {
    const business = await this.getBusinessDoc(user);
    return this.walletService.cancelWithdrawal(business._id.toString(), referenceId);
  }
}
