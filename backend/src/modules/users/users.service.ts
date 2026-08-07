import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersRepository } from './users.repository';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { UserRole } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/currency.enum';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { UserDocument, User } from './schemas/user.schema';
import { IntegrationRegisterUserDto } from '../business/dto/integration.dto';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

export type UserListOpts = ListQueryOpts & { role?: string };

const DEFAULT_INVESTOR_PLAN_AMOUNTS = [25000, 50000, 100000, 200000];

@Injectable()
export class UsersService {
  constructor(
    private usersRepo: UsersRepository,
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
    private platformSettingsService: PlatformSettingsService,
  ) {}

  async create(dto: CreateUserDto, createdBy?: string) {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    let referredByBusiness: string | undefined;

    if (dto.referralCode) {
      const code = dto.referralCode.trim();
      const business = await this.businessModel
        .findOne({
          referralCode: { $regex: `^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
          status: { $in: [UserStatus.ACTIVE, UserStatus.PENDING] },
        })
        .exec();
      if (!business) throw new BadRequestException('Invalid business code');
      referredByBusiness = business._id.toString();
    } else if (dto.businessId) {
      const business = await this.businessModel.findById(dto.businessId).exec();
      if (!business) throw new BadRequestException('Invalid business');
      referredByBusiness = business._id.toString();
    }

    const createData: Partial<User> = {
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      phone: dto.phone,
      role: dto.role || UserRole.USER,
      permissions: dto.permissions || [],
    };
    if (referredByBusiness) {
      createData.referredByBusiness = new Types.ObjectId(referredByBusiness);
    }
    if (createdBy) {
      createData.createdBy = new Types.ObjectId(createdBy);
    }

    const user = await this.usersRepo.create(createData);

    if (referredByBusiness) {
      await this.businessModel.findByIdAndUpdate(referredByBusiness, {
        $inc: { totalUsers: 1 },
      });
    }

    return this.sanitize(user);
  }

  async createForBusiness(businessId: string, dto: IntegrationRegisterUserDto) {
    const email = dto.email.toLowerCase().trim();
    const externalRef = dto.externalRef?.trim() || undefined;
    const existing = await this.usersRepo.findByEmail(email);

    if (existing) {
      return this.claimOrReuseForBusiness(businessId, existing, {
        name: dto.name,
        phone: dto.phone,
        externalRef,
      });
    }

    if (externalRef) {
      const dup = await this.usersRepo.findByExternalRefForBusiness(businessId, externalRef);
      if (dup) throw new ConflictException('externalRef already registered for this business');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = await this.usersRepo.create({
      email,
      password: hashedPassword,
      name: dto.name,
      phone: dto.phone,
      role: UserRole.USER,
      referredByBusiness: new Types.ObjectId(businessId),
      externalRef,
      mustSetPassword: true,
    });

    await this.businessModel.findByIdAndUpdate(businessId, {
      $inc: { totalUsers: 1 },
    });

    return { ...this.formatIntegrationUser(user, businessId), created: true as const };
  }

  /**
   * Partner SSO re-launch: email already exists.
   * - Same business → reuse + backfill externalRef
   * - No business / deleted business → claim for this partner
   * - Another live business → reclaim only when partner externalRef can safely attach
   */
  private async claimOrReuseForBusiness(
    businessId: string,
    existing: UserDocument,
    patch: { name?: string; phone?: string; externalRef?: string },
  ) {
    const currentBiz = existing.referredByBusiness?.toString();

    if (currentBiz && currentBiz !== businessId) {
      const other = await this.businessModel.findById(currentBiz).exec();
      if (other) {
        const canReclaim =
          !!patch.externalRef &&
          (!existing.externalRef || existing.externalRef === patch.externalRef);
        if (!canReclaim) {
          throw new ConflictException('Email already registered with another business');
        }
        // Partner SSO reclaim (e.g. business recreated; same email + externalRef)
      }
    }

    const updates: Record<string, unknown> = {};
    let claimed = false;

    if (currentBiz !== businessId) {
      updates.referredByBusiness = new Types.ObjectId(businessId);
      claimed = true;
    }

    if (patch.name?.trim() && patch.name.trim() !== existing.name) {
      updates.name = patch.name.trim();
    }
    if (patch.phone?.trim() && patch.phone.trim() !== existing.phone) {
      updates.phone = patch.phone.trim();
    }

    if (patch.externalRef) {
      if (existing.externalRef && existing.externalRef !== patch.externalRef) {
        const dup = await this.usersRepo.findByExternalRefForBusiness(
          businessId,
          patch.externalRef,
        );
        if (dup && dup._id.toString() !== existing._id.toString()) {
          throw new ConflictException('externalRef already registered for this business');
        }
      }
      if (existing.externalRef !== patch.externalRef) {
        updates.externalRef = patch.externalRef;
      }
    }

    let user = existing;
    if (Object.keys(updates).length) {
      user = await this.usersRepo.update(existing._id.toString(), updates);
    }

    if (claimed) {
      await this.businessModel.findByIdAndUpdate(businessId, {
        $inc: { totalUsers: 1 },
      });
    }

    return { ...this.formatIntegrationUser(user, businessId), created: false as const };
  }

  async findByBusiness(businessId: string, opts: UserListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [
      { referredByBusiness: new Types.ObjectId(businessId) },
    ];

    if (opts.role && opts.role !== 'all') and.push({ role: opts.role });
    if (status) and.push({ status });
    if (search) {
      and.push({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { externalRef: { $regex: search, $options: 'i' } },
          { businessUserCode: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = { $and: and };
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      status: { status: 1, createdAt: -1 },
    });

    const { items, total } = await this.usersRepo.findAll(filter, skip, limit, sortSpec);
    return {
      items: items.map((u) => this.formatIntegrationUser(u, businessId)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findById(id: string) {
    const user = await this.usersRepo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeWithBusiness(user);
  }

  async findByEmail(email: string) {
    return this.usersRepo.findByEmail(email);
  }

  async findByEmailForBusiness(businessId: string, email: string) {
    const user = await this.usersRepo.findByEmail(email.toLowerCase().trim());
    if (!user) throw new NotFoundException('User not found');

    const currentBiz = user.referredByBusiness?.toString();
    if (currentBiz === businessId) {
      return this.formatIntegrationUser(user, businessId);
    }

    // Not linked to this business yet — partner should POST /users to claim/link.
    throw new NotFoundException('User not found');
  }

  async findByIdForBusiness(businessId: string, userId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.referredByBusiness?.toString() !== businessId) {
      throw new ForbiddenException('User does not belong to this business');
    }
    return this.formatIntegrationUser(user, businessId);
  }

  async findByExternalRefForBusiness(businessId: string, externalRef: string) {
    const user = await this.usersRepo.findByExternalRefForBusiness(
      businessId,
      externalRef.trim(),
    );
    if (!user) throw new NotFoundException('User not found');
    return this.formatIntegrationUser(user, businessId);
  }

  async resolveForBusiness(
    businessId: string,
    query: { email?: string; userId?: string; externalRef?: string },
  ) {
    if (query.userId?.trim()) {
      return this.findByIdForBusiness(businessId, query.userId.trim());
    }
    if (query.externalRef?.trim()) {
      return this.findByExternalRefForBusiness(businessId, query.externalRef.trim());
    }
    if (query.email?.trim()) {
      return this.findByEmailForBusiness(businessId, query.email);
    }
    throw new BadRequestException('email, userId, or externalRef query parameter is required');
  }

  async findAll(opts: UserListOpts = {}) {
    const { page, limit, skip, search, status, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [];

    if (opts.role && opts.role !== 'all') and.push({ role: opts.role });
    if (status) and.push({ status });
    if (search) {
      and.push({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      status: { status: 1, createdAt: -1 },
    });

    const { items, total } = await this.usersRepo.findAll(filter, skip, limit, sortSpec);
    return {
      items: await Promise.all(items.map((u) => this.sanitizeWithBusiness(u))),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.usersRepo.update(id, dto);
    return this.sanitize(user);
  }

  /** Attach business via referral code after register (only if not already linked). */
  async attachReferral(userId: string, referralCode: string) {
    const code = referralCode?.trim();
    if (!code) throw new BadRequestException('Referral code is required');

    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.USER && user.role !== UserRole.INVESTOR) {
      throw new BadRequestException('Only end users can join via referral code');
    }
    if (user.referredByBusiness) {
      throw new BadRequestException('You are already linked to a business');
    }

    const business = await this.businessModel
      .findOne({
        referralCode: code,
        status: { $in: [UserStatus.ACTIVE, UserStatus.PENDING] },
      })
      .exec();
    if (!business) throw new BadRequestException('Invalid business code');

    const updated = await this.usersRepo.update(userId, {
      referredByBusiness: business._id as unknown as Types.ObjectId,
    });
    await this.businessModel.findByIdAndUpdate(business._id, {
      $inc: { totalUsers: 1 },
    });
    return this.sanitize(updated);
  }

  async validatePassword(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  /** Set / change password (first-time partner users skip current password). */
  async setPassword(
    userId: string,
    dto: { newPassword: string; currentPassword?: string },
  ) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!user.mustSetPassword) {
      if (!dto.currentPassword?.trim()) {
        throw new BadRequestException('currentPassword is required');
      }
      const ok = await this.validatePassword(dto.currentPassword, user.password);
      if (!ok) throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    const updated = await this.usersRepo.update(userId, {
      password: hashedPassword,
      mustSetPassword: false,
    });
    return this.sanitize(updated);
  }

  /** Business admin resets a linked user's login password (no current password needed). */
  async setPasswordForBusinessUser(
    businessId: string,
    userId: string,
    newPassword: string,
  ) {
    const password = newPassword?.trim();
    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.referredByBusiness?.toString() !== businessId) {
      throw new ForbiddenException('User does not belong to this business');
    }
    if (user.role !== UserRole.USER && user.role !== UserRole.INVESTOR) {
      throw new BadRequestException('Can only reset password for end users');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const updated = await this.usersRepo.update(userId, {
      password: hashedPassword,
      mustSetPassword: false,
    });
    return this.sanitize(updated);
  }

  /** Business assigns a human-readable code to a referred user. */
  async setBusinessUserCode(businessId: string, userId: string, code: string) {
    const businessUserCode = code?.trim();
    if (!businessUserCode) {
      throw new BadRequestException('businessUserCode is required');
    }

    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.referredByBusiness?.toString() !== businessId) {
      throw new ForbiddenException('User does not belong to this business');
    }
    if (user.role !== UserRole.USER && user.role !== UserRole.INVESTOR) {
      throw new BadRequestException('Can only set code for end users');
    }

    try {
      const updated = await this.usersRepo.update(userId, { businessUserCode });
      return this.sanitize(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('duplicate') || msg.includes('E11000')) {
        throw new ConflictException('businessUserCode already in use for this business');
      }
      throw err;
    }
  }

  /** Investor selects a plan amount (once or update). */
  async setInvestorPlan(userId: string, planAmount: number) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.INVESTOR) {
      throw new ForbiddenException('Only investors can select a plan');
    }

    const settings = await this.platformSettingsService.get();
    const allowed =
      settings.investorPlanAmounts?.length > 0
        ? settings.investorPlanAmounts
        : DEFAULT_INVESTOR_PLAN_AMOUNTS;
    if (!allowed.includes(planAmount)) {
      throw new BadRequestException(
        `Invalid plan amount. Allowed: ${allowed.join(', ')}`,
      );
    }

    const updated = await this.usersRepo.update(userId, {
      investorPlanAmount: planAmount,
      investorPlanSelectedAt: new Date(),
    });
    return this.sanitizeWithBusiness(updated);
  }

  private sanitize(user: UserDocument) {
    const obj = user.toObject() as unknown as Record<string, unknown>;
    delete obj.password;

    const ref = obj.referredByBusiness;
    if (ref && typeof ref === 'object' && ref !== null && '_id' in (ref as object)) {
      const b = ref as { _id: Types.ObjectId; name?: string; referralCode?: string };
      obj.referredBusiness = {
        _id: b._id,
        name: b.name,
        referralCode: b.referralCode,
      };
      obj.referredByBusiness = b._id;
    }

    return obj;
  }

  /** Sanitize and ensure referredBusiness is populated for admin/profile responses. */
  private async sanitizeWithBusiness(user: UserDocument) {
    const obj = this.sanitize(user) as Record<string, unknown>;
    if (obj.referredBusiness) return obj;

    let bizId: string | undefined;
    if (user.referredByBusiness) {
      bizId = user.referredByBusiness.toString();
    } else if (typeof obj.referredByBusiness === 'string') {
      bizId = obj.referredByBusiness;
    }
    if (!bizId) return obj;

    const biz = await this.businessModel
      .findById(bizId)
      .select('name referralCode')
      .lean()
      .exec();
    if (biz) {
      obj.referredBusiness = {
        _id: biz._id,
        name: biz.name,
        referralCode: biz.referralCode,
      };
    }
    return obj;
  }

  /**
   * Link / backfill partner user id (externalRef) for an existing business user.
   * Used when user was found by email before Bitfarming id was stored.
   */
  async ensureExternalRefForBusiness(
    businessId: string,
    userId: string,
    externalRef: string,
  ) {
    const ref = externalRef.trim();
    if (!ref) throw new BadRequestException('externalRef is required');

    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.referredByBusiness?.toString() !== businessId) {
      throw new ForbiddenException('User does not belong to this business');
    }

    if (user.externalRef === ref) {
      return this.formatIntegrationUser(user, businessId);
    }

    const dup = await this.usersRepo.findByExternalRefForBusiness(businessId, ref);
    if (dup && dup._id.toString() !== userId) {
      throw new ConflictException('externalRef already registered for this business');
    }

    const updated = await this.usersRepo.update(userId, { externalRef: ref });
    return this.formatIntegrationUser(updated, businessId);
  }

  private formatIntegrationUser(user: UserDocument, businessId: string) {
    const base = this.sanitize(user) as Record<string, unknown>;
    const userId = user._id.toString();
    const externalRef = base.externalRef as string | undefined;
    return {
      ...base,
      userId,
      businessId,
      email: String(base.email),
      name: String(base.name),
      externalRef,
      businessUserCode: base.businessUserCode as string | undefined,
      /** Partner platform user id (e.g. Bitfarming Mongo _id) parsed from externalRef */
      partnerUserId: partnerUserIdFromExternalRef(externalRef),
      mustSetPassword: !!base.mustSetPassword,
    };
  }
}
