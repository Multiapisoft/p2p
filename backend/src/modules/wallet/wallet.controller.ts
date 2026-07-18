import { Controller, Get, Post, Body, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { ExchangeRateService } from './exchange-rate.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { WalletAdjustDto } from './dto/wallet.dto';
import { UsersRepository } from '../users/users.repository';
import { BusinessService } from '../business/business.service';
import { PartnerApiService } from '../integration/partner-api.service';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';

@Controller('wallets')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private walletService: WalletService,
    private exchangeRateService: ExchangeRateService,
    private usersRepo: UsersRepository,
    private businessService: BusinessService,
    private partnerApiService: PartnerApiService,
  ) {}

  @Get()
  getMyWallets(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.findByUser(user.userId);
  }

  @Get('exchange-rate')
  getExchangeRate() {
    const q = this.exchangeRateService.getQuote();
    return {
      usdtInr: q.usdtInr,
      pair: q.pair,
      updatedAt: q.updatedAt,
      source: q.source,
    };
  }

  @Get('balance')
  async getBalance(@CurrentUser() user: AuthenticatedUser) {
    const partner = await this.tryPartnerBalance(user.userId);
    if (partner) return partner;

    const balance = await this.walletService.getAvailableBalance(user.userId);
    const redeemable = await this.walletService.getRedeemableAmount(user.userId);
    return {
      availableBalance: balance,
      redeemableAmount: redeemable,
      currency: 'INR',
      usdtInrRate: this.exchangeRateService.getUsdtInrRate(),
    };
  }

  private async tryPartnerBalance(userId: string) {
    try {
      const doc = await this.usersRepo.findById(userId);
      if (!doc?.referredByBusiness) return null;

      const business = await this.businessService.findDocumentById(
        doc.referredByBusiness.toString(),
      );
      if (!this.partnerApiService.isConfigured(business)) return null;

      const partnerBalance = await this.partnerApiService.fetchBalance(business, {
        email: doc.email,
        userId: partnerUserIdFromExternalRef(doc.externalRef),
      });

      const usdtInrRate = this.exchangeRateService.getUsdtInrRate();
      const currency = (partnerBalance.currency || 'INR').toUpperCase();
      const approxInr =
        currency === 'USDT'
          ? this.exchangeRateService.usdtToInr(partnerBalance.availableBalance)
          : undefined;

      return {
        availableBalance: partnerBalance.availableBalance,
        redeemableAmount: partnerBalance.availableBalance,
        source: 'partner' as const,
        currency,
        lockedBalance: partnerBalance.lockedBalance,
        balance: partnerBalance.balance,
        usdtInrRate,
        approxInrAvailable: approxInr,
      };
    } catch (err) {
      this.logger.warn(
        `Partner balance fetch failed for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  @Post('adjust')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WALLET_ADJUST)
  adjust(@CurrentUser() user: AuthenticatedUser, @Body() dto: WalletAdjustDto) {
    return this.walletService.adjust(
      dto.userId,
      dto.amount,
      dto.type,
      dto.reason,
      user.email,
    );
  }
}
