import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
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
import { Currency } from '../../common/enums/currency.enum';
import { Types } from 'mongoose';

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

  @Get('by-user/:userId')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WALLET_ADJUST)
  async getByUser(@Param('userId') userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user id');
    }
    const doc = await this.usersRepo.findById(userId);
    if (!doc) throw new NotFoundException('User not found');

    const wallet = await this.walletService.getOrCreate(userId, Currency.INR);
    const wallets = await this.walletService.findByUser(userId);

    return {
      user: {
        _id: doc._id,
        name: doc.name,
        email: doc.email,
        phone: doc.phone,
        role: doc.role,
        status: doc.status,
      },
      wallet: {
        _id: wallet._id,
        currency: wallet.currency,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        availableBalance: wallet.balance - wallet.lockedBalance,
      },
      wallets: (wallets.length ? wallets : [wallet]).map((w) => ({
        _id: w._id,
        currency: w.currency,
        balance: w.balance,
        lockedBalance: w.lockedBalance,
        availableBalance: w.balance - w.lockedBalance,
      })),
    };
  }

  @Post('adjust')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  @Permissions(Permission.WALLET_ADJUST)
  async adjust(@CurrentUser() user: AuthenticatedUser, @Body() dto: WalletAdjustDto) {
    const userId = await this.resolveAdjustUserId(dto);
    const currency =
      dto.currency?.toUpperCase() === Currency.USDT ? Currency.USDT : Currency.INR;

    return this.walletService.adjust(
      userId,
      dto.amount,
      dto.type,
      dto.reason,
      user.email,
      currency,
    );
  }

  private async resolveAdjustUserId(dto: WalletAdjustDto): Promise<string> {
    if (dto.userId?.trim()) {
      if (!Types.ObjectId.isValid(dto.userId)) {
        throw new BadRequestException('Invalid user id');
      }
      const doc = await this.usersRepo.findById(dto.userId.trim());
      if (!doc) throw new NotFoundException('User not found');
      return doc._id.toString();
    }

    if (dto.email?.trim()) {
      const doc = await this.usersRepo.findByEmail(dto.email.trim());
      if (!doc) throw new NotFoundException('User not found for this email');
      return doc._id.toString();
    }

    if (dto.phone?.trim()) {
      const doc = await this.usersRepo.findByPhone(dto.phone.trim());
      if (!doc) throw new NotFoundException('User not found for this phone');
      return doc._id.toString();
    }

    throw new BadRequestException('Provide userId, email, or phone');
  }
}
