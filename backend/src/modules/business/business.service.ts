import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Business, BusinessDocument } from './schemas/business.schema';
import { CreateBusinessDto, UpdateBusinessDto } from './dto/business.dto';
import { UserStatus } from '../../common/enums/currency.enum';
import { RedisService } from '../../redis/redis.service';
import { resolvePartnerApiUrls } from './utils/partner-api-urls.util';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';

export type BusinessListOpts = ListQueryOpts;

@Injectable()
export class BusinessService {
  constructor(
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    private redis: RedisService,
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
        baseUrl: partnerUrls.baseUrl,
        balanceUrl: partnerUrls.balanceUrl,
        creditUrl: partnerUrls.creditUrl,
        debitUrl: partnerUrls.debitUrl,
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

    const { integrationUrls, ...rest } = dto;
    Object.assign(business, rest);
    if (integrationUrls) {
      business.integrationUrls = { ...(business.integrationUrls || {}), ...integrationUrls };
      business.markModified('integrationUrls');
    }

    await business.save();
    await this.redis.del(`business:${business._id.toString()}`);
    return this.sanitize(business);
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

    const limit = business.p2pPayLimit || 0;
    const used = business.p2pPayUsed || 0;

    return {
      totalDeposits: business.totalDeposits,
      totalWithdrawals: business.totalWithdrawals,
      totalUsers: business.totalUsers,
      totalCommissionEarned: business.totalCommissionEarned,
      commissionRate: business.commissionRate,
      p2pPayLimit: limit,
      p2pPayUsed: used,
      p2pPayRemaining: limit > 0 ? Math.max(0, limit - used) : null,
    };
  }

  async setP2pPayLimit(businessId: string, p2pPayLimit: number) {
    if (p2pPayLimit < 0) throw new BadRequestException('Limit cannot be negative');
    const business = await this.businessModel
      .findByIdAndUpdate(businessId, { p2pPayLimit }, { new: true })
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    await this.redis.del(`business:${businessId}`);
    return business;
  }

  /** Remaining INR that can still be paid by investors (null = unlimited). */
  async getP2pPayRemaining(businessId: string): Promise<number | null> {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');
    const limit = business.p2pPayLimit || 0;
    if (limit <= 0) return null;
    return Math.round(Math.max(0, limit - (business.p2pPayUsed || 0)) * 100) / 100;
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
    if (remInr == null) {
      return { maxPayable: open, p2pPayRemainingInr: null };
    }
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

  /** Business IDs that still accept investor pays (unlimited or remaining > 0). */
  async findBusinessIdsOpenForP2pPay(): Promise<Types.ObjectId[]> {
    const rows = await this.businessModel
      .find({
        $or: [
          { p2pPayLimit: { $exists: false } },
          { p2pPayLimit: null },
          { p2pPayLimit: { $lte: 0 } },
          { $expr: { $lt: [{ $ifNull: ['$p2pPayUsed', 0] }, '$p2pPayLimit'] } },
        ],
      })
      .select('_id')
      .lean()
      .exec();
    return rows.map((r) => r._id as Types.ObjectId);
  }

  /** Businesses whose P2P pay quota is fully used (limit > 0 and used >= limit). */
  async findBusinessIdsExhaustedForP2pPay(): Promise<Types.ObjectId[]> {
    const rows = await this.businessModel
      .find({
        p2pPayLimit: { $gt: 0 },
        $expr: {
          $gte: [{ $ifNull: ['$p2pPayUsed', 0] }, '$p2pPayLimit'],
        },
      })
      .select('_id')
      .lean()
      .exec();
    return rows.map((r) => r._id as Types.ObjectId);
  }

  /**
   * Reserve pay volume against business limit (on payment submit).
   * Unlimited when p2pPayLimit <= 0.
   */
  async reserveP2pPay(businessId: string, amount: number) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0) return;
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) throw new NotFoundException('Business not found');

    const limit = business.p2pPayLimit || 0;
    if (limit <= 0) {
      await this.businessModel.findByIdAndUpdate(businessId, {
        $inc: { p2pPayUsed: rounded },
      });
      return;
    }

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
              '$p2pPayLimit',
            ],
          },
        },
        { $inc: { p2pPayUsed: rounded } },
        { new: true },
      )
      .exec();

    if (!updated) {
      const remaining = Math.round(
        Math.max(0, limit - (business.p2pPayUsed || 0)) * 100,
      ) / 100;
      throw new BadRequestException(
        `Business P2P pay limit exhausted. Remaining ₹${remaining}. Pay at most ₹${remaining}.`,
      );
    }
    await this.redis.del(`business:${businessId}`);
  }

  async releaseP2pPay(businessId: string, amount: number) {
    if (amount <= 0) return;
    await this.businessModel.findByIdAndUpdate(businessId, {
      $inc: { p2pPayUsed: -amount },
    });
    // Clamp used >= 0
    await this.businessModel.updateOne(
      { _id: businessId, p2pPayUsed: { $lt: 0 } },
      { $set: { p2pPayUsed: 0 } },
    );
    await this.redis.del(`business:${businessId}`);
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
    return obj;
  }
}
