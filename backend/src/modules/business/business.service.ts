import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Business, BusinessDocument } from './schemas/business.schema';
import { Withdrawal, WithdrawalDocument } from '../withdrawal/schemas/withdrawal.schema';
import { CreateBusinessDto, UpdateBusinessDto, UpdateBusinessTxnFlagsDto } from './dto/business.dto';
import { UserStatus, Currency, LedgerType, LedgerDirection } from '../../common/enums/currency.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { RedisService } from '../../redis/redis.service';
import { resolvePartnerApiUrls } from './utils/partner-api-urls.util';
import {
  resolveDepositMethods as resolveDepositMethodsList,
  resolveWithdrawalMethods as resolveWithdrawalMethodsList,
} from './utils/payment-methods.util';
import { assignDefinedFields } from './utils/assign-defined.util';
import {
  MIN_PARTIAL_INR,
  minPartialAmount,
} from '../withdrawal/utils/partial-pay.util';
import {
  p2pPayQuotaCap,
  p2pPayQuotaRemaining,
  p2pPayLimitExceededError,
} from './utils/p2p-pay-quota.util';
import {
  p2pPayQuotaLedgerDescription,
  type P2pPayQuotaLedgerAction,
  type P2pPayQuotaRef,
} from './utils/p2p-pay-quota-ledger.util';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { UsersRepository } from '../users/users.repository';
import { Permission } from '../../common/enums/permission.enum';
import { staffHasPermission } from '../../common/utils/business-staff.util';
import { TransactionService } from '../transaction/transaction.service';

export type BusinessListOpts = ListQueryOpts;

@Injectable()
export class BusinessService {
  constructor(
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    @InjectModel(Withdrawal.name) private withdrawalModel: Model<WithdrawalDocument>,
    private redis: RedisService,
    private usersRepo: UsersRepository,
    @Inject(forwardRef(() => TransactionService))
    private transactionService: TransactionService,
  ) {}

  async create(ownerId: string, dto: CreateBusinessDto) {
    const ownerTaken = await this.businessModel.findOne({ ownerId }).exec();
    if (ownerTaken) throw new ConflictException('Business already exists for this owner');

    const slug = await this.resolveUniqueSlug(dto.slug || dto.name);

    let partnerUrls: ReturnType<typeof resolvePartnerApiUrls>;
    try {
      partnerUrls = resolvePartnerApiUrls(dto.partnerApi);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid partner API');
    }

    const apiKey = `pk_${uuidv4().replace(/-/g, '')}`;
    const apiSecret = `sk_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
    const apiSecretHash = await bcrypt.hash(apiSecret, 12);
    const internalSecret = `is_${uuidv4().replace(/-/g, '')}${uuidv4().slice(0, 8)}`;
    const internalSecretHash = await bcrypt.hash(internalSecret, 12);
    const referralCode = `ref_${slug}_${uuidv4().slice(0, 8)}`;

    const business = await this.businessModel.create({
      ownerId,
      name: dto.name,
      slug,
      description: dto.description,
      apiKey,
      apiSecretHash,
      internalSecretHash,
      referralCode,
      webhookUrl: dto.webhookUrl,
      partnerApi: {
        ...(partnerUrls || {}),
        apiKey,
        apiSecret,
      },
      commissionRate: dto.commissionRate ?? 0,
      allowedPaymentMethods: dto.allowedPaymentMethods,
      status: UserStatus.ACTIVE,
    });

    return {
      business: this.sanitize(business),
      apiKey,
      apiSecret,
      internalSecret,
      referralCode,
    };
  }

  private slugify(text: string) {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || `biz-${uuidv4().slice(0, 8)}`;
  }

  private async resolveUniqueSlug(raw: string) {
    const base = this.slugify(raw);
    let candidate = base;
    for (let i = 0; i < 8; i++) {
      const exists = await this.businessModel.exists({ slug: candidate });
      if (!exists) return candidate;
      candidate = `${base}-${uuidv4().slice(0, 6)}`;
    }
    return `${base}-${uuidv4().slice(0, 8)}`;
  }

  async findByOwner(ownerId: string) {
    const oid = Types.ObjectId.isValid(ownerId) ? new Types.ObjectId(ownerId) : null;
    const business = await this.businessModel
      .findOne({
        $or: [{ ownerId }, ...(oid ? [{ ownerId: oid }] : [])],
      })
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    return this.sanitize(business);
  }

  async findForActor(userId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.staffBusinessId) {
      return this.findById(user.staffBusinessId.toString());
    }
    return this.findByOwner(userId);
  }

  /**
   * Business whose P2P pay quota / fee rules apply for this user:
   * staff → referred users → owned business.
   */
  async findBusinessIdForUser(user: {
    _id?: Types.ObjectId;
    staffBusinessId?: Types.ObjectId;
    referredByBusiness?: Types.ObjectId;
  } | null | undefined): Promise<string | undefined> {
    if (!user) return undefined;
    if (user.staffBusinessId) return user.staffBusinessId.toString();
    if (user.referredByBusiness) return user.referredByBusiness.toString();
    const ownerId = user._id?.toString();
    if (!ownerId) return undefined;
    const oid = Types.ObjectId.isValid(ownerId) ? new Types.ObjectId(ownerId) : null;
    const owned = await this.businessModel
      .findOne({
        $or: [{ ownerId }, ...(oid ? [{ ownerId: oid }] : [])],
      })
      .select('_id')
      .lean()
      .exec();
    return owned?._id?.toString();
  }

  async assertActorIsOwner(userId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user || user.staffBusinessId) {
      throw new ForbiddenException('Only the business owner can do this');
    }
  }

  async assertStaffCan(userId: string, need: Permission) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new ForbiddenException('Insufficient permissions');
    const allowed = staffHasPermission({
      isOwner: !user.staffBusinessId,
      permissions: user.permissions,
      need,
    });
    if (!allowed) throw new ForbiddenException('Missing required permissions');
  }

  async findDocumentByOwner(ownerId: string) {
    const business = await this.businessModel
      .findOne({ ownerId })
      .select('+partnerApi.apiSecret')
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  /** Full document with partnerApi.apiSecret — for partner balance/credit/debit. */
  async findDocumentById(id: string) {
    const business = await this.businessModel
      .findById(id)
      .select('+partnerApi.apiSecret')
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async findById(id: string) {
    const cached = await this.redis.get<BusinessDocument>(`business:${id}`);
    if (cached) return cached;

    const business = await this.businessModel.findById(id).exec();
    if (!business) throw new NotFoundException('Business not found');
    await this.redis.set(`business:${id}`, business.toObject());
    return this.sanitize(business);
  }

  async findByApiKey(apiKey: string) {
    return this.businessModel
      .findOne({ apiKey, status: UserStatus.ACTIVE })
      .select('+partnerApi.apiSecret')
      .exec();
  }

  async validateApiSecret(business: BusinessDocument, secret: string): Promise<boolean> {
    return bcrypt.compare(secret, business.apiSecretHash);
  }

  async validateInternalSecret(business: BusinessDocument, secret: string): Promise<boolean> {
    if (!business.internalSecretHash) return false;
    return bcrypt.compare(secret, business.internalSecretHash);
  }

  async update(ownerId: string, dto: UpdateBusinessDto) {
    const business = await this.businessModel.findOne({ ownerId }).exec();
    if (!business) throw new NotFoundException('Business not found');

    const {
      integrationUrls,
      depositsEnabled: _d,
      withdrawalsEnabled: _w,
      b2bMatchingEnabled: _b,
      allowPartialPay: _p,
      allowMobileNumberUpi: _m,
      allowedDepositMethods,
      allowedWithdrawalMethods,
      ...rest
    } = dto;
    this.assignDefined(business, rest);
    if (integrationUrls) {
      business.integrationUrls = { ...(business.integrationUrls || {}), ...integrationUrls };
      business.markModified('integrationUrls');
    }
    if (allowedDepositMethods) {
      business.allowedDepositMethods = allowedDepositMethods;
      business.allowedPaymentMethods = [...allowedDepositMethods];
      business.markModified('allowedDepositMethods');
      business.markModified('allowedPaymentMethods');
    }
    if (allowedWithdrawalMethods) {
      business.allowedWithdrawalMethods = allowedWithdrawalMethods;
      business.markModified('allowedWithdrawalMethods');
    }

    await business.save();
    await this.redis.del(`business:${business._id.toString()}`);
    return this.sanitize(business);
  }

  /** Admin: toggle deposit/withdrawal/B2B flags (Noida #49/#50). */
  async updateByAdmin(businessId: string, dto: UpdateBusinessDto) {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    const { integrationUrls, ...rest } = dto;
    // Never Object.assign raw DTO — plainToInstance leaves undefined keys that wipe required fields.
    this.assignDefined(business, rest);
    if (integrationUrls) {
      business.integrationUrls = { ...(business.integrationUrls || {}), ...integrationUrls };
      business.markModified('integrationUrls');
    }
    await business.save();
    await this.redis.del(`business:${businessId}`);
    return this.sanitize(business);
  }

  async updateTxnFlags(businessId: string, dto: UpdateBusinessTxnFlagsDto) {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    this.assignDefined(business, dto);
    if (dto.allowedDepositMethods) {
      business.allowedPaymentMethods = [...dto.allowedDepositMethods];
      business.markModified('allowedDepositMethods');
      business.markModified('allowedPaymentMethods');
    }
    if (dto.allowedWithdrawalMethods) {
      business.markModified('allowedWithdrawalMethods');
    }
    await business.save();
    await this.redis.del(`business:${businessId}`);
    return this.sanitize(business);
  }

  async assertWithdrawalsEnabled(businessId: string) {
    const business = await this.businessModel.findById(businessId).select('withdrawalsEnabled name').exec();
    if (!business) throw new NotFoundException('Business not found');
    if (business.withdrawalsEnabled === false) {
      throw new BadRequestException(
        `Withdrawals are disabled for ${business.name}. Contact platform admin.`,
      );
    }
  }

  async assertDepositsEnabled(businessId: string) {
    const business = await this.businessModel.findById(businessId).select('depositsEnabled name').exec();
    if (!business) throw new NotFoundException('Business not found');
    if (business.depositsEnabled === false) {
      throw new BadRequestException(
        `Deposits are disabled for ${business.name}. Contact platform admin.`,
      );
    }
  }

  resolveDepositMethods(business: {
    allowedDepositMethods?: PaymentMethod[] | null;
    allowedPaymentMethods?: PaymentMethod[] | null;
  }): PaymentMethod[] {
    return resolveDepositMethodsList(business);
  }

  resolveWithdrawalMethods(business: {
    allowedWithdrawalMethods?: PaymentMethod[] | null;
    allowedPaymentMethods?: PaymentMethod[] | null;
  }): PaymentMethod[] {
    return resolveWithdrawalMethodsList(business);
  }

  async assertDepositMethodAllowed(businessId: string, method: PaymentMethod) {
    const business = await this.businessModel
      .findById(businessId)
      .select('name allowedDepositMethods allowedPaymentMethods')
      .lean()
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    const allowed = this.resolveDepositMethods(business);
    if (!allowed.includes(method)) {
      throw new BadRequestException(
        `Deposit method "${method}" is disabled for ${business.name}. Contact platform admin.`,
      );
    }
  }

  async assertWithdrawalMethodAllowed(businessId: string, method: PaymentMethod) {
    const business = await this.businessModel
      .findById(businessId)
      .select('name allowedWithdrawalMethods allowedPaymentMethods')
      .lean()
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    const allowed = this.resolveWithdrawalMethods(business);
    if (!allowed.includes(method)) {
      throw new BadRequestException(
        `Withdrawal method "${method}" is disabled for ${business.name}. Contact platform admin.`,
      );
    }
  }

  /** Platform default, overridden when business has an explicit boolean (Noida #53). */
  async resolveAllowPartialPay(
    platformAllow: boolean,
    businessId?: string | null,
  ): Promise<boolean> {
    if (!businessId) return platformAllow;
    const business = await this.businessModel
      .findById(businessId)
      .select('allowPartialPay')
      .lean()
      .exec();
    if (!business || typeof business.allowPartialPay !== 'boolean') return platformAllow;
    return business.allowPartialPay;
  }

  /** Per-business min partial (INR); falls back to platform ₹5,000 default. */
  async resolveMinPartialPay(
    businessId: string | null | undefined,
    method?: string,
    currency?: string,
  ): Promise<number> {
    const usdt =
      method === 'usdt' || (currency || '').toUpperCase() === 'USDT';
    if (usdt) return minPartialAmount(method, currency);
    if (!businessId) return MIN_PARTIAL_INR;
    const business = await this.businessModel
      .findById(businessId)
      .select('minPartialPayInr')
      .lean()
      .exec();
    const custom = business?.minPartialPayInr;
    if (typeof custom === 'number' && custom > 0) return custom;
    return MIN_PARTIAL_INR;
  }

  /** Platform default, overridden when business has an explicit boolean (Noida #37). */
  async resolveAllowMobileNumberUpi(
    platformAllow: boolean,
    businessId?: string | null,
  ): Promise<boolean> {
    if (!businessId) return platformAllow;
    const business = await this.businessModel
      .findById(businessId)
      .select('allowMobileNumberUpi')
      .lean()
      .exec();
    if (!business || typeof business.allowMobileNumberUpi !== 'boolean') {
      return platformAllow;
    }
    return business.allowMobileNumberUpi;
  }

  async updateIntegrationUrls(
    ownerId: string,
    integrationUrls: NonNullable<UpdateBusinessDto['integrationUrls']>,
  ) {
    return this.update(ownerId, { integrationUrls });
  }

  async updatePartnerApi(
    ownerId: string,
    dto: {
      baseUrl?: string;
      balanceUrl?: string;
      creditUrl?: string;
      debitUrl?: string;
    },
  ) {
    const business = await this.businessModel
      .findOne({ ownerId })
      .select('+partnerApi.apiSecret')
      .exec();
    if (!business) throw new NotFoundException('Business not found');

    let partnerUrls: ReturnType<typeof resolvePartnerApiUrls>;
    try {
      partnerUrls = resolvePartnerApiUrls(dto);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid partner API');
    }
    if (!partnerUrls?.balanceUrl || !partnerUrls.creditUrl || !partnerUrls.debitUrl) {
      throw new BadRequestException(
        'Provide partner baseUrl, or all three balance/credit/debit URLs',
      );
    }

    business.partnerApi = {
      baseUrl: partnerUrls.baseUrl,
      balanceUrl: partnerUrls.balanceUrl,
      creditUrl: partnerUrls.creditUrl,
      debitUrl: partnerUrls.debitUrl,
      apiKey: business.apiKey,
      apiSecret: business.partnerApi?.apiSecret,
    };
    if (!business.partnerApi.apiSecret) {
      throw new ConflictException('Partner API not linked — regenerate keys from Integration');
    }

    business.markModified('partnerApi');
    await business.save();
    await this.redis.del(`business:${business._id.toString()}`);

    return {
      partnerApi: {
        baseUrl: business.partnerApi.baseUrl,
        balanceUrl: business.partnerApi.balanceUrl,
        creditUrl: business.partnerApi.creditUrl,
        debitUrl: business.partnerApi.debitUrl,
        apiKey: business.partnerApi.apiKey,
        linked: true,
      },
    };
  }

  async getPartnerApiForOwner(ownerId: string) {
    const business = await this.businessModel
      .findOne({ ownerId })
      .select('+partnerApi.apiSecret')
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    const cfg = business.partnerApi || {};
    return {
      baseUrl: cfg.baseUrl || null,
      balanceUrl: cfg.balanceUrl || null,
      creditUrl: cfg.creditUrl || null,
      debitUrl: cfg.debitUrl || null,
      apiKey: business.apiKey,
      configured: !!(
        cfg.balanceUrl &&
        cfg.creditUrl &&
        cfg.debitUrl &&
        cfg.apiSecret
      ),
    };
  }

  async regenerateKeys(ownerId: string) {
    const business = await this.businessModel.findOne({ ownerId }).exec();
    if (!business) throw new NotFoundException('Business not found');

    const apiKey = `pk_${uuidv4().replace(/-/g, '')}`;
    const apiSecret = `sk_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
    const internalSecret = `is_${uuidv4().replace(/-/g, '')}${uuidv4().slice(0, 8)}`;
    business.apiKey = apiKey;
    business.apiSecretHash = await bcrypt.hash(apiSecret, 12);
    business.internalSecretHash = await bcrypt.hash(internalSecret, 12);
    business.internalKey = undefined;
    if (business.partnerApi) {
      business.partnerApi.apiKey = apiKey;
      business.partnerApi.apiSecret = apiSecret;
      business.markModified('partnerApi');
    }
    await business.save();
    await this.redis.del(`business:${business._id.toString()}`);

    return { apiKey, apiSecret, internalSecret };
  }

  async regenerateInternalKeys(ownerId: string) {
    const business = await this.businessModel.findOne({ ownerId }).exec();
    if (!business) throw new NotFoundException('Business not found');

    const internalSecret = `is_${uuidv4().replace(/-/g, '')}${uuidv4().slice(0, 8)}`;
    business.internalSecretHash = await bcrypt.hash(internalSecret, 12);
    business.internalKey = undefined;
    await business.save();
    await this.redis.del(`business:${business._id.toString()}`);

    return { internalSecret };
  }

  async approve(businessId: string) {
    const business = await this.businessModel
      .findByIdAndUpdate(businessId, { status: UserStatus.ACTIVE }, { new: true })
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    await this.redis.del(`business:${businessId}`);
    return this.sanitize(business);
  }

  async getStats(businessId: string) {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');

    const hold = await this.sumOpenBusinessOriginHold(businessId);
    const snap = this.quotaSnapshot(business, hold);

    return {
      totalDeposits: business.totalDeposits,
      totalWithdrawals: business.totalWithdrawals,
      totalUsers: business.totalUsers,
      totalCommissionEarned: business.totalCommissionEarned,
      commissionRate: business.commissionRate,
      p2pPayLimit: snap.p2pPayLimit,
      p2pPayEarned: snap.p2pPayEarned,
      p2pPayUsed: snap.p2pPayUsed,
      p2pPayCap: snap.p2pPayCap,
      p2pPayRemaining: snap.p2pPayRemaining,
      ...this.highlightSnapshot(business),
    };
  }

  async setHighlightLimitPerMonth(businessId: string, highlightLimitPerMonth: number) {
    if (!Types.ObjectId.isValid(businessId)) {
      throw new BadRequestException('Invalid business id');
    }
    if (highlightLimitPerMonth < 0) {
      throw new BadRequestException('Highlight limit cannot be negative');
    }
    const rounded = Math.floor(highlightLimitPerMonth);
    const business = await this.businessModel
      .findByIdAndUpdate(businessId, { highlightLimitPerMonth: rounded }, { new: true })
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    await this.redis.del(`business:${businessId}`);
    return this.sanitize(business);
  }

  /** UTC calendar month key, e.g. 2026-08 */
  currentHighlightMonthKey(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  highlightSnapshot(
    business: Pick<
      Business,
      'highlightLimitPerMonth' | 'highlightUsedThisMonth' | 'highlightMonthKey'
    >,
  ) {
    const monthKey = this.currentHighlightMonthKey();
    const limit = Math.max(0, Math.floor(Number(business.highlightLimitPerMonth) || 0));
    const used =
      business.highlightMonthKey === monthKey
        ? Math.max(0, Math.floor(Number(business.highlightUsedThisMonth) || 0))
        : 0;
    return {
      highlightLimitPerMonth: limit,
      highlightUsedThisMonth: used,
      highlightRemainingThisMonth: Math.max(0, limit - used),
      highlightMonthKey: monthKey,
    };
  }

  async getHighlightQuota(businessId: string) {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    return this.highlightSnapshot(business);
  }

  /** Consume one monthly highlight slot (business actor). */
  async consumeHighlightSlot(businessId: string) {
    const monthKey = this.currentHighlightMonthKey();
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    const snap = this.highlightSnapshot(business);
    if (snap.highlightLimitPerMonth <= 0) {
      throw new BadRequestException(
        'Highlighting is disabled. Ask admin to set a monthly highlight limit for your business.',
      );
    }
    if (snap.highlightRemainingThisMonth <= 0) {
      throw new BadRequestException(
        `Monthly highlight limit reached (${snap.highlightLimitPerMonth}). Resets next month.`,
      );
    }
    await this.businessModel
      .findByIdAndUpdate(businessId, {
        highlightMonthKey: monthKey,
        highlightUsedThisMonth: snap.highlightUsedThisMonth + 1,
      })
      .exec();
    await this.redis.del(`business:${businessId}`);
  }

  /** Refund one slot when business clears a highlight in the same month. */
  async releaseHighlightSlot(businessId: string) {
    const monthKey = this.currentHighlightMonthKey();
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) return;
    const snap = this.highlightSnapshot(business);
    if (snap.highlightUsedThisMonth <= 0) return;
    await this.businessModel
      .findByIdAndUpdate(businessId, {
        highlightMonthKey: monthKey,
        highlightUsedThisMonth: snap.highlightUsedThisMonth - 1,
      })
      .exec();
    await this.redis.del(`business:${businessId}`);
  }

  async setP2pPayLimit(
    businessId: string,
    p2pPayLimit: number,
    ref?: P2pPayQuotaRef,
    mode: 'set' | 'add' | 'deduct' = 'set',
  ) {
    if (!Types.ObjectId.isValid(businessId)) {
      throw new BadRequestException('Invalid business id');
    }
    if (p2pPayLimit < 0) throw new BadRequestException('Limit cannot be negative');
    const amount = Math.round(p2pPayLimit * 100) / 100;
    const before = await this.businessModel.findById(businessId).exec();
    if (!before) throw new NotFoundException('Business not found');
    const seedBefore = before.p2pPayLimit || 0;
    let rounded: number;
    let action: P2pPayQuotaLedgerAction;
    let ledgerAmount: number;
    let refType: string;
    switch (mode) {
      case 'add': {
        if (amount <= 0) throw new BadRequestException('Add amount must be greater than 0');
        rounded = Math.round((seedBefore + amount) * 100) / 100;
        action = 'add';
        ledgerAmount = amount;
        refType = 'p2p_pay_limit_add';
        break;
      }
      case 'deduct': {
        if (amount <= 0) throw new BadRequestException('Deduct amount must be greater than 0');
        rounded = Math.max(0, Math.round((seedBefore - amount) * 100) / 100);
        action = 'deduct';
        ledgerAmount = Math.round((seedBefore - rounded) * 100) / 100;
        refType = 'p2p_pay_limit_deduct';
        break;
      }
      case 'set': {
        rounded = amount;
        action = 'set';
        ledgerAmount = Math.abs(Math.round((rounded - seedBefore) * 100) / 100);
        refType = 'p2p_pay_limit_set';
        break;
      }
      default: {
        const _exhaustive: never = mode;
        throw new BadRequestException(`Unsupported mode: ${_exhaustive}`);
      }
    }
    const hold = await this.sumOpenBusinessOriginHold(businessId);
    const remainingBefore = p2pPayQuotaRemaining({
      p2pPayLimit: before.p2pPayLimit,
      p2pPayEarned: before.p2pPayEarned,
      p2pPayUsed: before.p2pPayUsed,
      hold,
    });
    const business = await this.businessModel
      .findByIdAndUpdate(businessId, { p2pPayLimit: rounded }, { new: true })
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    await this.redis.del(`business:${businessId}`);
    const remainingAfter = p2pPayQuotaRemaining({
      p2pPayLimit: business.p2pPayLimit,
      p2pPayEarned: business.p2pPayEarned,
      p2pPayUsed: business.p2pPayUsed,
      hold,
    });
    if (ledgerAmount > 0) {
      await this.recordQuotaLedger({
        business,
        action,
        amount: ledgerAmount,
        remainingBefore,
        remainingAfter,
        seedBefore,
        seedAfter: rounded,
        ref: { referenceType: refType, referenceId: businessId, ...ref },
      });
    }
    return this.sanitize(business);
  }

  /** Open business-origin WD amounts held against the P2P limit (not yet completed). */
  async sumOpenBusinessOriginHold(businessId: string): Promise<number> {
    const rows = await this.withdrawalModel
      .aggregate<{ total: number }>([
        {
          $match: {
            origin: 'business',
            businessId: new Types.ObjectId(businessId),
            status: { $in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    return Math.round((rows[0]?.total || 0) * 100) / 100;
  }

  private quotaSnapshot(
    business: Pick<Business, 'p2pPayLimit' | 'p2pPayEarned' | 'p2pPayUsed'>,
    hold = 0,
  ) {
    const p2pPayLimit = business.p2pPayLimit || 0;
    const p2pPayEarned = business.p2pPayEarned || 0;
    const p2pPayUsed = business.p2pPayUsed || 0;
    return {
      p2pPayLimit,
      p2pPayEarned,
      p2pPayUsed,
      p2pPayCap: p2pPayQuotaCap(p2pPayLimit, p2pPayEarned),
      p2pPayRemaining: p2pPayQuotaRemaining({
        p2pPayLimit,
        p2pPayEarned,
        p2pPayUsed,
        hold,
      }),
    };
  }

  private quotaCapExpr() {
    return {
      $add: [
        { $max: [0, { $ifNull: ['$p2pPayLimit', 0] }] },
        { $ifNull: ['$p2pPayEarned', 0] },
      ],
    };
  }

  /** Remaining INR that can still be withdrawn / paid toward this business. */
  async getP2pPayRemaining(businessId: string): Promise<number> {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    const hold = await this.sumOpenBusinessOriginHold(businessId);
    return p2pPayQuotaRemaining({
      p2pPayLimit: business.p2pPayLimit,
      p2pPayEarned: business.p2pPayEarned,
      p2pPayUsed: business.p2pPayUsed,
      hold,
    });
  }

  /** Reject withdrawals / pays that do not fit remaining INR quota. */
  async assertP2pPayAmountAllowed(businessId: string, amountInr: number): Promise<number> {
    const remaining = await this.getP2pPayRemaining(businessId);
    const need = Math.round(amountInr * 100) / 100;
    if (need > remaining) {
      throw new BadRequestException(p2pPayLimitExceededError(remaining));
    }
    return remaining;
  }

  /** Credit quota when this business's users complete a deposit / pay any user. */
  async creditP2pPayQuota(businessId: string, amount: number, ref?: P2pPayQuotaRef) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0) return;
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    const hold = await this.sumOpenBusinessOriginHold(businessId);
    const remainingBefore = p2pPayQuotaRemaining({
      p2pPayLimit: business.p2pPayLimit,
      p2pPayEarned: business.p2pPayEarned,
      p2pPayUsed: business.p2pPayUsed,
      hold,
    });
    const updated = await this.businessModel
      .findByIdAndUpdate(businessId, { $inc: { p2pPayEarned: rounded } }, { new: true })
      .exec();
    await this.redis.del(`business:${businessId}`);
    if (!updated) return;
    const remainingAfter = p2pPayQuotaRemaining({
      p2pPayLimit: updated.p2pPayLimit,
      p2pPayEarned: updated.p2pPayEarned,
      p2pPayUsed: updated.p2pPayUsed,
      hold,
    });
    await this.recordQuotaLedger({
      business: updated,
      action: 'add',
      amount: rounded,
      remainingBefore,
      remainingAfter,
      ref: { referenceType: 'p2p_pay_limit_add', referenceId: businessId, ...ref },
    });
  }

  /** Move a completed business-origin WD from hold into used (no remaining check). */
  async consumeP2pPay(businessId: string, amount: number, ref?: P2pPayQuotaRef) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0) return;
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    const hold = await this.sumOpenBusinessOriginHold(businessId);
    const remainingBefore = p2pPayQuotaRemaining({
      p2pPayLimit: business.p2pPayLimit,
      p2pPayEarned: business.p2pPayEarned,
      p2pPayUsed: business.p2pPayUsed,
      hold,
    });
    const updated = await this.businessModel
      .findByIdAndUpdate(businessId, { $inc: { p2pPayUsed: rounded } }, { new: true })
      .exec();
    await this.redis.del(`business:${businessId}`);
    if (!updated) return;
    const remainingAfter = p2pPayQuotaRemaining({
      p2pPayLimit: updated.p2pPayLimit,
      p2pPayEarned: updated.p2pPayEarned,
      p2pPayUsed: updated.p2pPayUsed,
      hold,
    });
    await this.recordQuotaLedger({
      business: updated,
      action: 'deduct',
      amount: rounded,
      remainingBefore,
      remainingAfter,
      ref: { referenceType: 'p2p_pay_limit_deduct', referenceId: businessId, ...ref },
    });
  }

  /**
   * Cap a withdrawal pay amount by business P2P INR remaining.
   * `payCurrency` / method decide whether remaining INR is converted to USDT.
   */
  async getMaxPayableAmount(
    businessId: string | undefined,
    withdrawalRemaining: number,
    payCurrency: string,
    method?: string,
    inrToPayCurrency?: (inr: number) => number,
  ): Promise<{ maxPayable: number; p2pPayRemainingInr: number | null }> {
    const open = Math.max(0, withdrawalRemaining);
    if (!businessId || open <= 0) {
      return { maxPayable: open, p2pPayRemainingInr: null };
    }
    const remInr = await this.getP2pPayRemaining(businessId);
    if (remInr <= 0) {
      return { maxPayable: 0, p2pPayRemainingInr: 0 };
    }

    const payIsUsdt =
      (payCurrency || '').toUpperCase() === 'USDT' || method === 'usdt';
    if (payIsUsdt && inrToPayCurrency) {
      const maxInPay = inrToPayCurrency(remInr);
      return {
        maxPayable: Math.min(open, maxInPay),
        p2pPayRemainingInr: remInr,
      };
    }

    return {
      maxPayable: Math.min(open, remInr),
      p2pPayRemainingInr: remInr,
    };
  }

  /** Business IDs that still accept investor pays (remaining quota > 0). */
  async findBusinessIdsOpenForP2pPay(): Promise<Types.ObjectId[]> {
    const rows = await this.businessModel
      .find({
        $expr: { $lt: [{ $ifNull: ['$p2pPayUsed', 0] }, this.quotaCapExpr()] },
      })
      .select('_id')
      .lean()
      .exec();
    return rows.map((r) => r._id as Types.ObjectId);
  }

  /** Businesses whose P2P pay quota is fully used. Cached briefly to speed pay-list queries. */
  async findBusinessIdsExhaustedForP2pPay(): Promise<Types.ObjectId[]> {
    const cacheKey = 'business:p2p-exhausted-ids';
    const cached = await this.redis.get<string[]>(cacheKey);
    if (Array.isArray(cached)) {
      return cached.map((id) => new Types.ObjectId(id));
    }
    const rows = await this.businessModel
      .find({
        $expr: {
          $and: [
            { $gt: [this.quotaCapExpr(), 0] },
            { $gte: [{ $ifNull: ['$p2pPayUsed', 0] }, this.quotaCapExpr()] },
          ],
        },
      })
      .select('_id')
      .lean()
      .exec();
    const ids = rows.map((r) => r._id.toString());
    await this.redis.set(cacheKey, ids, 30);
    return rows.map((r) => r._id as Types.ObjectId);
  }

  /**
   * Reserve pay volume against business quota (on payment submit).
   */
  async reserveP2pPay(businessId: string, amount: number, ref?: P2pPayQuotaRef) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0) return;
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    const hold = await this.sumOpenBusinessOriginHold(businessId);
    const remainingBefore = p2pPayQuotaRemaining({
      p2pPayLimit: business.p2pPayLimit,
      p2pPayEarned: business.p2pPayEarned,
      p2pPayUsed: business.p2pPayUsed,
      hold,
    });

    const cap = this.quotaCapExpr();
    const updated = await this.businessModel
      .findOneAndUpdate(
        {
          _id: businessId,
          $expr: {
            $lte: [
              {
                $round: [
                  {
                    $add: [{ $ifNull: ['$p2pPayUsed', 0] }, rounded],
                  },
                  2,
                ],
              },
              cap,
            ],
          },
        },
        { $inc: { p2pPayUsed: rounded } },
        { new: true },
      )
      .exec();

    if (!updated) {
      const remaining = p2pPayQuotaRemaining({
          p2pPayLimit: business.p2pPayLimit,
          p2pPayEarned: business.p2pPayEarned,
          p2pPayUsed: business.p2pPayUsed,
        });
      throw new BadRequestException(
        `Business P2P pay limit exhausted. Remaining ₹${remaining}. Pay at most ₹${remaining}.`,
      );
    }
    await this.redis.del(`business:${businessId}`);
    const remainingAfter = p2pPayQuotaRemaining({
      p2pPayLimit: updated.p2pPayLimit,
      p2pPayEarned: updated.p2pPayEarned,
      p2pPayUsed: updated.p2pPayUsed,
      hold,
    });
    await this.recordQuotaLedger({
      business: updated,
      action: 'deduct',
      amount: rounded,
      remainingBefore,
      remainingAfter,
      ref: { referenceType: 'p2p_pay_limit_deduct', referenceId: businessId, ...ref },
    });
  }

  async releaseP2pPay(businessId: string, amount: number, ref?: P2pPayQuotaRef) {
    if (amount <= 0) return;
    const rounded = Math.round(amount * 100) / 100;
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) return;
    const hold = await this.sumOpenBusinessOriginHold(businessId);
    const remainingBefore = p2pPayQuotaRemaining({
      p2pPayLimit: business.p2pPayLimit,
      p2pPayEarned: business.p2pPayEarned,
      p2pPayUsed: business.p2pPayUsed,
      hold,
    });
    await this.businessModel.findByIdAndUpdate(businessId, {
      $inc: { p2pPayUsed: -rounded },
    });
    // Clamp used >= 0
    await this.businessModel.updateOne(
      { _id: businessId, p2pPayUsed: { $lt: 0 } },
      { $set: { p2pPayUsed: 0 } },
    );
    await this.redis.del(`business:${businessId}`);
    const updated = await this.businessModel.findById(businessId).exec();
    if (!updated) return;
    const remainingAfter = p2pPayQuotaRemaining({
      p2pPayLimit: updated.p2pPayLimit,
      p2pPayEarned: updated.p2pPayEarned,
      p2pPayUsed: updated.p2pPayUsed,
      hold,
    });
    const restored = Math.round((remainingAfter - remainingBefore) * 100) / 100;
    if (restored > 0) {
      await this.recordQuotaLedger({
        business: updated,
        action: 'release',
        amount: restored,
        remainingBefore,
        remainingAfter,
        ref: {
          referenceType: 'p2p_pay_limit_add',
          referenceId: businessId,
          ...ref,
          reason: ref?.reason || 'list_release',
        },
      });
    }
  }

  private async recordQuotaLedger(opts: {
    business: BusinessDocument;
    action: P2pPayQuotaLedgerAction;
    amount: number;
    remainingBefore: number;
    remainingAfter: number;
    seedBefore?: number;
    seedAfter?: number;
    ref?: P2pPayQuotaRef;
  }) {
    if (opts.amount <= 0) return;
    const ownerId = opts.business.ownerId?.toString();
    if (!ownerId) return;
    const direction =
      opts.remainingAfter >= opts.remainingBefore
        ? LedgerDirection.CREDIT
        : LedgerDirection.DEBIT;
    const refType = opts.ref?.referenceType;
    const feeToAdmin =
      refType === 'withdrawal_payment_fee' || refType === 'withdrawal_payment_deposit_fee';
    const reason =
      opts.ref?.reason ||
      (refType === 'withdrawal_payment_fee'
        ? 'wd_fee'
        : refType === 'withdrawal_payment_deposit_fee'
          ? 'deposit_fee'
          : refType === 'withdrawal_list'
            ? 'list_reserve'
            : refType === 'deposit'
              ? 'user_deposit'
              : undefined);
    await this.transactionService.record({
      userId: ownerId,
      type: LedgerType.P2P_LIMIT,
      direction,
      amount: opts.amount,
      currency: Currency.INR,
      balanceBefore: opts.remainingBefore,
      balanceAfter: opts.remainingAfter,
      referenceType: refType || 'p2p_pay_limit',
      referenceId: opts.ref?.referenceId || opts.business._id.toString(),
      description: p2pPayQuotaLedgerDescription({
        action: opts.action,
        amount: opts.amount,
        remainingBefore: opts.remainingBefore,
        remainingAfter: opts.remainingAfter,
        seedBefore: opts.seedBefore,
        seedAfter: opts.seedAfter,
        feeToAdmin,
        reason,
      }),
      businessId: opts.business._id.toString(),
      fromParty: direction === LedgerDirection.DEBIT ? opts.business.name : 'Platform',
      toParty: direction === LedgerDirection.DEBIT ? 'Platform' : opts.business.name,
    });
  }

  async incrementStats(
    businessId: string,
    field: 'totalDeposits' | 'totalWithdrawals' | 'totalCommissionEarned',
    amount: number,
  ) {
    await this.businessModel.findByIdAndUpdate(businessId, { $inc: { [field]: amount } });
    await this.redis.del(`business:${businessId}`);
  }

  async findAll(opts: BusinessListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [];

    if (status) and.push({ status });
    if (search) {
      and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { referralCode: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      status: { status: 1, createdAt: -1 },
      amount_desc: { totalDeposits: -1 },
      amount_asc: { totalDeposits: 1 },
    });

    const [items, total] = await Promise.all([
      this.businessModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.businessModel.countDocuments(filter).exec(),
    ]);
    return {
      items: items.map((b) => this.sanitize(b)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async assertOwner(businessId: string, ownerId: string) {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('Not your business');
    }
    return business;
  }

  private assignDefined(
    target: BusinessDocument,
    source: Record<string, unknown> | object,
  ) {
    assignDefinedFields(target, source);
  }

  private sanitize(business: BusinessDocument | Record<string, unknown>) {
    const obj =
      'toObject' in business && typeof business.toObject === 'function'
        ? business.toObject()
        : { ...business };
    delete obj.apiSecretHash;
    delete obj.internalSecretHash;
    if (obj.partnerApi && typeof obj.partnerApi === 'object') {
      const partner = { ...(obj.partnerApi as Record<string, unknown>) };
      delete partner.apiSecret;
      obj.partnerApi = partner;
    }
    return {
      ...obj,
      allowedDepositMethods: this.resolveDepositMethods({
        allowedDepositMethods: obj.allowedDepositMethods as PaymentMethod[] | undefined,
        allowedPaymentMethods: obj.allowedPaymentMethods as PaymentMethod[] | undefined,
      }),
      allowedWithdrawalMethods: this.resolveWithdrawalMethods({
        allowedWithdrawalMethods: obj.allowedWithdrawalMethods as PaymentMethod[] | undefined,
        allowedPaymentMethods: obj.allowedPaymentMethods as PaymentMethod[] | undefined,
      }),
      ...this.quotaSnapshot({
        p2pPayLimit: Number(obj.p2pPayLimit) || 0,
        p2pPayEarned: Number(obj.p2pPayEarned) || 0,
        p2pPayUsed: Number(obj.p2pPayUsed) || 0,
      }),
      ...this.highlightSnapshot({
        highlightLimitPerMonth: Number(obj.highlightLimitPerMonth) || 0,
        highlightUsedThisMonth: Number(obj.highlightUsedThisMonth) || 0,
        highlightMonthKey:
          typeof obj.highlightMonthKey === 'string' ? obj.highlightMonthKey : undefined,
      }),
    };
  }
}
