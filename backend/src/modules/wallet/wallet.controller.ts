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
import { PlatformCommissionService } from './platform-commission.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { WalletAdjustDto, ResetTxnDataDto } from './dto/wallet.dto';
import { UsersRepository } from '../users/users.repository';
import { BusinessService } from '../business/business.service';
import { PartnerApiService } from '../integration/partner-api.service';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';
import { Currency } from '../../common/enums/currency.enum';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Withdrawal, WithdrawalDocument } from '../withdrawal/schemas/withdrawal.schema';
import { Deposit, DepositDocument } from '../deposit/schemas/deposit.schema';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { AuditService } from '../audit/audit.service';

@Controller('wallets')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private walletService: WalletService,
    private exchangeRateService: ExchangeRateService,
    private platformCommissionService: PlatformCommissionService,
    private usersRepo: UsersRepository,
    private businessService: BusinessService,
    private partnerApiService: PartnerApiService,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel(Deposit.name) private depositModel: Model<DepositDocument>,
    private auditService: AuditService,
  ) {}

  @Get()
  getMyWallets(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.findByUser(user.userId);
  }

  @Get('platform')
  @Roles(UserRole.ADMIN, UserRole.SUB_ADMIN)
  async getPlatformWallet() {
    const { admin, wallet, availableBalance } =
      await this.platformCommissionService.getPlatformWallet(Currency.INR);
    return {
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      wallet: {
        _id: wallet._id,
        currency: wallet.currency,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        availableBalance,
      },
    };
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
    if (partner) return this.withP2pPayRemaining(user.userId, partner);

    const balance = await this.walletService.getAvailableBalance(user.userId);
    const redeemable = await this.walletService.getRedeemableAmount(user.userId);
    return this.withP2pPayRemaining(user.userId, {
      availableBalance: balance,
      redeemableAmount: redeemable,
      currency: 'INR',
      usdtInrRate: this.exchangeRateService.getUsdtInrRate(),
    });
  }

  private async withP2pPayRemaining<T extends object>(userId: string, payload: T) {
    try {
      const doc = await this.usersRepo.findById(userId);
      const bizId = await this.businessService.findBusinessIdForUser(doc);
      if (!bizId) return payload;
      const p2pPayRemainingInr = await this.businessService.getP2pPayRemaining(bizId);
      return { ...payload, p2pPayRemainingInr };
    } catch {
      return payload;
    }
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

  @Post('reset-txn-data')
  @Roles(UserRole.ADMIN)
  async resetTxnData(@CurrentUser() user: AuthenticatedUser, @Body() dto: ResetTxnDataDto) {
    if (dto.confirm !== 'RESET') {
      throw new BadRequestException('Type RESET to confirm');
    }

    const { entityId, entityLabel } = await this.resolveResetEntity(dto);

    const userIds: string[] = [];
    if (dto.entityType === 'business') {
      const biz = await this.businessService.findDocumentById(entityId);
      userIds.push(biz.ownerId.toString());
      const linked = await this.usersRepo.findAll(
        { referredByBusiness: new Types.ObjectId(entityId) },
        0,
        5000,
      );
      for (const u of linked.items) userIds.push(u._id.toString());
    } else {
      const doc = await this.usersRepo.findById(entityId);
      if (!doc) throw new NotFoundException('User not found');
      if (dto.entityType === 'investor' && doc.role !== UserRole.INVESTOR) {
        throw new BadRequestException('Entity is not an investor');
      }
      if (dto.entityType === 'user' && doc.role !== UserRole.USER) {
        throw new BadRequestException('Entity is not an end user');
      }
      userIds.push(doc._id.toString());
    }

    const uniqueIds = [...new Set(userIds)];
    const cancelledWd = await this.withdrawalModel.updateMany(
      {
        userId: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
        status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
      },
      {
        $set: {
          status: TransactionStatus.CANCELLED,
          failureReason: `Txn data reset by ${user.email}`,
        },
      },
    );
    const cancelledDep = await this.depositModel.updateMany(
      {
        userId: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
        status: TransactionStatus.PENDING,
      },
      {
        $set: {
          status: TransactionStatus.CANCELLED,
        },
      },
    );

    const wallets = await this.walletService.resetEntityTxnData({
      userIds: uniqueIds,
      adminEmail: user.email,
      reason: `reset ${dto.entityType} ${entityLabel}`,
    });

    await this.auditService.log({
      actorId: user.userId,
      actorEmail: user.email,
      action: 'reset_txn_data',
      resource: dto.entityType,
      resourceId: entityId,
      metadata: {
        entityLabel,
        userCount: uniqueIds.length,
        cancelledWithdrawals: cancelledWd.modifiedCount,
        cancelledDeposits: cancelledDep.modifiedCount,
      },
    });

    return {
      ok: true,
      users: uniqueIds.length,
      cancelledWithdrawals: cancelledWd.modifiedCount,
      cancelledDeposits: cancelledDep.modifiedCount,
      wallets,
    };
  }

  private async resolveResetEntity(dto: ResetTxnDataDto): Promise<{
    entityId: string;
    entityLabel: string;
  }> {
    if (dto.entityId?.trim()) {
      const entityId = dto.entityId.trim();
      if (!Types.ObjectId.isValid(entityId)) {
        throw new BadRequestException('Invalid entity id');
      }
      return { entityId, entityLabel: entityId };
    }

    let account = null as Awaited<ReturnType<UsersRepository['findByEmail']>>;
    if (dto.email?.trim()) {
      account = await this.usersRepo.findByEmail(dto.email.trim());
      if (!account) throw new NotFoundException('User not found for this email');
    } else if (dto.phone?.trim()) {
      account = await this.usersRepo.findByPhone(dto.phone.trim());
      if (!account) throw new NotFoundException('User not found for this phone');
    } else {
      throw new BadRequestException('Provide entity id, email, or phone');
    }

    if (dto.entityType === 'business') {
      if (account.role !== UserRole.BUSINESS) {
        throw new BadRequestException('This account is not a business owner');
      }
      const business = await this.businessService.findDocumentByOwner(account._id.toString());
      if (!business) throw new NotFoundException('Business profile not found for this owner');
      return {
        entityId: business._id.toString(),
        entityLabel: `${account.email} · ${business.name}`,
      };
    }

    if (dto.entityType === 'investor' && account.role !== UserRole.INVESTOR) {
      throw new BadRequestException('This account is not an investor');
    }
    if (dto.entityType === 'user' && account.role !== UserRole.USER) {
      throw new BadRequestException('This account is not an end user');
    }

    return {
      entityId: account._id.toString(),
      entityLabel: account.email,
    };
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
