import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UsersRepository } from './users.repository';
import {
  CreateUserDto,
  UpdateUserDto,
  CreateBusinessStaffDto,
  UpdateBusinessStaffDto,
  UpsertSavedWithdrawalMethodDto,
} from './dto/create-user.dto';
import { UserRole } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/currency.enum';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { SavedWithdrawalMethod, UserDocument, User } from './schemas/user.schema';
import { IntegrationRegisterUserDto } from '../business/dto/integration.dto';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { isValidPhone } from '../../common/validators/contact.validators';
import {
  addInvestorLimitLot,
  consumeInvestorLimitLifo,
  investorLimitAdded,
  investorLimitLotsLifo,
  investorLimitRemaining,
  restoreInvestorLimitLifo,
  type InvestorLimitLot,
} from './utils/investor-limit-lifo.util';
import { sanitizeBusinessStaffPermissions } from '../../common/utils/business-staff.util';
import { assertValidWithdrawalDestination } from '../withdrawal/utils/withdrawal-destination.validation';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import {
  buildSavedWithdrawalMethodLabel,
  deleteSavedWithdrawalMethod as deleteSavedMethodUtil,
  ensureSavedMethodDefault,
  MAX_SAVED_WITHDRAWAL_METHODS,
  type SavedWithdrawalMethodView,
  upsertSavedWithdrawalMethod,
} from './utils/saved-withdrawal-methods.util';

export type UserListOpts = ListQueryOpts & { role?: string };

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

    const role = dto.role || UserRole.USER;
    if (
      (role === UserRole.USER ||
        role === UserRole.INVESTOR ||
        role === UserRole.BUSINESS) &&
      !dto.phone?.trim()
    ) {
      throw new BadRequestException('Mobile number is required');
    }

    if (dto.phone?.trim()) {
      const phoneTaken = await this.usersRepo.findByPhone(dto.phone.trim());
      if (phoneTaken) {
        throw new ConflictException('Mobile number already registered');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    let referredByBusiness: string | undefined;
    let referredByInvestor: string | undefined;

    if (dto.referralCode) {
      const code = dto.referralCode.trim();
      const business = await this.businessModel
        .findOne({
          referralCode: { $regex: `^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
          status: { $in: [UserStatus.ACTIVE, UserStatus.PENDING] },
        })
        .exec();
      if (business) {
        referredByBusiness = business._id.toString();
      } else {
        const investor = await this.usersRepo.findByReferralCode(code);
        if (!investor || investor.role !== UserRole.INVESTOR) {
          throw new BadRequestException('Invalid referral / business code');
        }
        referredByInvestor = investor._id.toString();
      }
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
      role,
      permissions: dto.permissions || [],
    };
    if (role === UserRole.INVESTOR) {
      createData.referralCode = `inv_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    }
    if (referredByBusiness) {
      createData.referredByBusiness = new Types.ObjectId(referredByBusiness);
    }
    if (referredByInvestor) {
      createData.referredByInvestor = new Types.ObjectId(referredByInvestor);
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
      const phoneTaken = await this.usersRepo.findByPhone(patch.phone.trim());
      if (phoneTaken && phoneTaken._id.toString() !== existing._id.toString()) {
        throw new ConflictException('Mobile number already registered');
      }
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
    let user = await this.usersRepo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.INVESTOR && !user.referralCode) {
      user = await this.usersRepo.update(id, {
        referralCode: `inv_${uuidv4().replace(/-/g, '').slice(0, 10)}`,
      });
    }
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
    const existing = await this.usersRepo.findById(id);
    if (!existing) throw new NotFoundException('User not found');

    if (existing.role === UserRole.USER || existing.role === UserRole.INVESTOR) {
      const nextPhone = dto.phone !== undefined ? dto.phone : existing.phone;
      if (!nextPhone || !isValidPhone(String(nextPhone))) {
        throw new BadRequestException('Mobile number is required');
      }
    }

    const user = await this.usersRepo.update(id, dto);
    return this.sanitize(user);
  }

  async getSavedWithdrawalMethods(userId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      items: this.normalizeSavedMethods(user.savedWithdrawalMethods),
    };
  }

  async saveWithdrawalMethod(
    userId: string,
    dto: UpsertSavedWithdrawalMethodDto,
    methodId?: string,
  ) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const settings = await this.platformSettingsService.get();
    assertValidWithdrawalDestination(
      {
        method: dto.method,
        upiDetails: dto.upiDetails,
        bankDetails: dto.bankDetails,
        usdtDetails: dto.usdtDetails,
      },
      { allowMobileNumber: !!settings.allowMobileNumberUpi },
    );

    const items = this.normalizeSavedMethods(user.savedWithdrawalMethods);
    if (!methodId && items.length >= MAX_SAVED_WITHDRAWAL_METHODS) {
      throw new BadRequestException(
        `You can save up to ${MAX_SAVED_WITHDRAWAL_METHODS} withdrawal methods`,
      );
    }
    const label = buildSavedWithdrawalMethodLabel(dto, dto.label);
    const next = {
      label,
      method: dto.method,
      isDefault: dto.isDefault === true,
      upiDetails: dto.method === 'upi' ? dto.upiDetails : undefined,
      bankDetails: dto.method === 'bank' ? dto.bankDetails : undefined,
      usdtDetails: dto.method === 'usdt' ? dto.usdtDetails : undefined,
      updatedAt: new Date().toISOString(),
    };

    const out = upsertSavedWithdrawalMethod(items, next, new Date().toISOString(), methodId);
    if (!out) throw new NotFoundException('Saved withdrawal method not found');

    const updated = await this.usersRepo.update(userId, {
      savedWithdrawalMethods: this.serializeSavedMethods(out),
    } as Partial<User>);
    return { items: this.normalizeSavedMethods(updated.savedWithdrawalMethods) };
  }

  async setDefaultWithdrawalMethod(userId: string, methodId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const items = this.normalizeSavedMethods(user.savedWithdrawalMethods);
    if (!items.some((m) => m._id === methodId)) {
      throw new NotFoundException('Saved withdrawal method not found');
    }
    const updated = await this.usersRepo.update(userId, {
      savedWithdrawalMethods: this.serializeSavedMethods(
        ensureSavedMethodDefault(items.map((m) => ({ ...m, isDefault: m._id === methodId }))),
      ),
    } as Partial<User>);
    return { items: this.normalizeSavedMethods(updated.savedWithdrawalMethods) };
  }

  async deleteSavedWithdrawalMethod(userId: string, methodId: string) {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const items = this.normalizeSavedMethods(user.savedWithdrawalMethods);
    const next = deleteSavedMethodUtil(items, methodId);
    if (!next) throw new NotFoundException('Saved withdrawal method not found');
    const updated = await this.usersRepo.update(userId, {
      savedWithdrawalMethods: this.serializeSavedMethods(next),
    } as Partial<User>);
    return { items: this.normalizeSavedMethods(updated.savedWithdrawalMethods) };
  }

  /** Investor: referral code + members who joined via that code. */
  async getReferralTeam(investorUserId: string, opts: ListQueryOpts = {}) {
    const investor = await this.usersRepo.findById(investorUserId);
    if (!investor) throw new NotFoundException('User not found');
    if (investor.role !== UserRole.INVESTOR) {
      throw new ForbiddenException('Only investors have a referral team');
    }

    let referralCode = investor.referralCode;
    if (!referralCode) {
      const updated = await this.usersRepo.update(investorUserId, {
        referralCode: `inv_${uuidv4().replace(/-/g, '').slice(0, 10)}`,
      });
      referralCode = updated.referralCode;
    }

    const { page, limit, skip, search, sort } = normalizeListOpts(opts);
    const filter: Record<string, unknown> = {
      referredByInvestor: new Types.ObjectId(investorUserId),
    };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name: { name: 1 },
    });

    const { items, total } = await this.usersRepo.findAll(filter, skip, limit, sortSpec);

    return {
      referralCode,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      items: items.map((u) => ({
        _id: u._id.toString(),
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        createdAt: (u as { createdAt?: Date }).createdAt,
      })),
    };
  }

  /** Attach business or investor via referral code after register. */
  async attachReferral(userId: string, referralCode: string) {
    const code = referralCode?.trim();
    if (!code) throw new BadRequestException('Referral code is required');

    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.USER && user.role !== UserRole.INVESTOR) {
      throw new BadRequestException('Only end users can join via referral code');
    }
    if (user.referredByBusiness || user.referredByInvestor) {
      throw new BadRequestException('You are already linked via a referral');
    }

    const business = await this.businessModel
      .findOne({
        referralCode: code,
        status: { $in: [UserStatus.ACTIVE, UserStatus.PENDING] },
      })
      .exec();
    if (business) {
      const updated = await this.usersRepo.update(userId, {
        referredByBusiness: business._id as unknown as Types.ObjectId,
      });
      await this.businessModel.findByIdAndUpdate(business._id, {
        $inc: { totalUsers: 1 },
      });
      return this.sanitize(updated);
    }

    const investor = await this.usersRepo.findByReferralCode(code);
    if (!investor) throw new BadRequestException('Invalid referral / business code');
    const updated = await this.usersRepo.update(userId, {
      referredByInvestor: investor._id as unknown as Types.ObjectId,
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
    return this.formatIntegrationUser(updated, businessId);
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
      return this.formatIntegrationUser(updated, businessId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('duplicate') || msg.includes('E11000')) {
        throw new ConflictException('businessUserCode already in use for this business');
      }
      throw err;
    }
  }

  /** Investor adds a custom pay-limit lot (no preset plans). */
  async addInvestorLimit(userId: string, amount: number) {
    await this.usersRepo.invalidateCache(userId);
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.INVESTOR) {
      throw new ForbiddenException('Only investors can add a pay limit');
    }
    const rounded = Math.round(amount * 100) / 100;
    if (rounded < 1) throw new BadRequestException('Amount must be at least 1');

    const lots = addInvestorLimitLot(this.readLots(user), rounded);
    const updated = await this.usersRepo.update(userId, {
      investorLimitLots: lots,
    } as Partial<User>);
    return this.investorLimitSnapshotFromUser(updated);
  }

  /** Legacy plan picker — stored as a single LIFO lot. */
  async setInvestorPlan(userId: string, planAmount: number) {
    return this.addInvestorLimit(userId, planAmount);
  }

  getInvestorLimitSnapshot(user: UserDocument) {
    return this.investorLimitSnapshotFromUser(user);
  }

  async getInvestorLimit(userId: string) {
    await this.usersRepo.invalidateCache(userId);
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const stored = (user.investorLimitLots || []) as InvestorLimitLot[];
    if (!stored.length && (user.investorPlanAmount || 0) > 0) {
      const lots = this.readLots(user);
      const updated = await this.usersRepo.update(userId, {
        investorLimitLots: lots,
      } as Partial<User>);
      return this.investorLimitSnapshotFromUser(updated);
    }
    return this.investorLimitSnapshotFromUser(user);
  }

  async consumeInvestorLimit(userId: string, amount: number) {
    await this.usersRepo.invalidateCache(userId);
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const { lots, consumed, shortfall } = consumeInvestorLimitLifo(
      this.readLots(user),
      amount,
    );
    if (shortfall > 0) {
      throw new BadRequestException(
        `Investor limit exhausted. Remaining ₹${investorLimitRemaining(this.readLots(user))}. Add amount first.`,
      );
    }
    await this.usersRepo.update(userId, { investorLimitLots: lots } as Partial<User>);
    return consumed;
  }

  async restoreInvestorLimit(userId: string, amount: number) {
    await this.usersRepo.invalidateCache(userId);
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const lots = restoreInvestorLimitLifo(this.readLots(user), amount);
    await this.usersRepo.update(userId, { investorLimitLots: lots } as Partial<User>);
  }

  private readLots(user: UserDocument): InvestorLimitLot[] {
    const stored = (user.investorLimitLots || []) as InvestorLimitLot[];
    if (stored.length) return stored;
    const legacy = user.investorPlanAmount || 0;
    if (legacy <= 0) return [];
    return [
      {
        amount: legacy,
        remaining: legacy,
        createdAt: user.investorPlanSelectedAt || new Date(),
      },
    ];
  }

  private investorLimitSnapshotFromUser(user: UserDocument) {
    const lots = this.readLots(user);
    const remaining = investorLimitRemaining(lots);
    const added = investorLimitAdded(lots);
    return {
      lots: investorLimitLotsLifo(lots).map((lot) => ({
        amount: lot.amount,
        remaining: lot.remaining,
        createdAt:
          lot.createdAt instanceof Date
            ? lot.createdAt.toISOString()
            : new Date(lot.createdAt).toISOString(),
      })),
      remaining,
      added,
      needsLimit: remaining <= 0,
    };
  }

  async createBusinessStaff(ownerUserId: string, dto: CreateBusinessStaffDto) {
    const owner = await this.usersRepo.findById(ownerUserId);
    if (!owner || owner.role !== UserRole.BUSINESS || owner.staffBusinessId) {
      throw new ForbiddenException('Only the business owner can add staff');
    }
    const oid = Types.ObjectId.isValid(ownerUserId) ? new Types.ObjectId(ownerUserId) : null;
    const business = await this.businessModel
      .findOne({ $or: [{ ownerId: ownerUserId }, ...(oid ? [{ ownerId: oid }] : [])] })
      .exec();
    if (!business) throw new NotFoundException('Business not found');

    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = await this.usersRepo.create({
      email: dto.email.trim().toLowerCase(),
      password: hashedPassword,
      name: dto.name.trim(),
      phone: dto.phone,
      role: UserRole.BUSINESS,
      permissions: sanitizeBusinessStaffPermissions(dto.permissions),
      staffBusinessId: business._id,
      createdBy: new Types.ObjectId(ownerUserId),
    });
    return this.sanitize(user);
  }

  async listBusinessStaff(ownerUserId: string) {
    const owner = await this.usersRepo.findById(ownerUserId);
    if (!owner || owner.role !== UserRole.BUSINESS || owner.staffBusinessId) {
      throw new ForbiddenException('Only the business owner can list staff');
    }
    const oid = Types.ObjectId.isValid(ownerUserId) ? new Types.ObjectId(ownerUserId) : null;
    const business = await this.businessModel
      .findOne({ $or: [{ ownerId: ownerUserId }, ...(oid ? [{ ownerId: oid }] : [])] })
      .exec();
    if (!business) throw new NotFoundException('Business not found');
    const { items } = await this.usersRepo.findAll(
      { staffBusinessId: business._id, role: UserRole.BUSINESS },
      0,
      100,
    );
    return { items: items.map((u) => this.sanitize(u)), total: items.length };
  }

  async updateBusinessStaff(ownerUserId: string, staffId: string, dto: UpdateBusinessStaffDto) {
    const owner = await this.usersRepo.findById(ownerUserId);
    if (!owner || owner.role !== UserRole.BUSINESS || owner.staffBusinessId) {
      throw new ForbiddenException('Only the business owner can update staff');
    }
    const staff = await this.usersRepo.findById(staffId);
    if (!staff?.staffBusinessId) throw new NotFoundException('Staff not found');
    const oid = Types.ObjectId.isValid(ownerUserId) ? new Types.ObjectId(ownerUserId) : null;
    const business = await this.businessModel
      .findOne({ $or: [{ ownerId: ownerUserId }, ...(oid ? [{ ownerId: oid }] : [])] })
      .exec();
    if (!business || staff.staffBusinessId.toString() !== business._id.toString()) {
      throw new ForbiddenException('Staff does not belong to this business');
    }
    const patch: Partial<User> = {};
    if (dto.permissions) patch.permissions = sanitizeBusinessStaffPermissions(dto.permissions);
    if (dto.status) patch.status = dto.status;
    const updated = await this.usersRepo.update(staffId, patch);
    return this.sanitize(updated);
  }

  private normalizeSavedMethods(methods?: SavedWithdrawalMethod[]): SavedWithdrawalMethodView[] {
    return (methods || []).map((m) => ({
      _id:
        typeof m._id === 'string'
          ? m._id
          : m._id && 'toString' in m._id
            ? m._id.toString()
            : new Types.ObjectId().toString(),
      label: m.label,
      method: m.method,
      isDefault: !!m.isDefault,
      upiDetails: m.upiDetails,
      bankDetails: m.bankDetails,
      usdtDetails: m.usdtDetails,
      createdAt:
        m.createdAt instanceof Date ? m.createdAt.toISOString() : new Date(m.createdAt || Date.now()).toISOString(),
      updatedAt:
        m.updatedAt instanceof Date ? m.updatedAt.toISOString() : new Date(m.updatedAt || Date.now()).toISOString(),
    }));
  }

  private serializeSavedMethods(methods: SavedWithdrawalMethodView[]): SavedWithdrawalMethod[] {
    return methods.map((m) => ({
      _id: new Types.ObjectId(m._id),
      label: m.label,
      method: m.method,
      isDefault: !!m.isDefault,
      upiDetails: m.upiDetails,
      bankDetails: m.bankDetails,
      usdtDetails: m.usdtDetails,
      createdAt: new Date(m.createdAt),
      updatedAt: new Date(m.updatedAt),
    }));
  }

  private sanitize(user: UserDocument) {
    const obj = user.toObject() as unknown as Record<string, unknown>;
    delete obj.password;
    delete obj.twoFactorSecret;

    const ref = obj.referredByBusiness;
    if (ref && typeof ref === 'object' && ref !== null && '_id' in (ref as object)) {
      const b = ref as {
        _id: Types.ObjectId;
        name?: string;
        referralCode?: string;
        allowedDepositMethods?: string[];
        allowedWithdrawalMethods?: string[];
        allowedPaymentMethods?: string[];
      };
      obj.referredBusiness = {
        _id: b._id,
        name: b.name,
        referralCode: b.referralCode,
        allowedDepositMethods:
          b.allowedDepositMethods?.length
            ? b.allowedDepositMethods
            : b.allowedPaymentMethods?.length
              ? b.allowedPaymentMethods
              : ['upi', 'bank', 'usdt', 'cdm'],
        allowedWithdrawalMethods:
          b.allowedWithdrawalMethods?.length
            ? b.allowedWithdrawalMethods
            : b.allowedPaymentMethods?.length
              ? b.allowedPaymentMethods
              : ['upi', 'bank', 'usdt', 'cdm'],
      };
      obj.referredByBusiness = b._id;
    }

    obj.savedWithdrawalMethods = this.normalizeSavedMethods(
      (user.savedWithdrawalMethods || []) as SavedWithdrawalMethod[],
    );

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
      .select('name referralCode allowedDepositMethods allowedWithdrawalMethods allowedPaymentMethods')
      .lean()
      .exec();
    if (biz) {
      const all = ['upi', 'bank', 'usdt', 'cdm'];
      obj.referredBusiness = {
        _id: biz._id,
        name: biz.name,
        referralCode: biz.referralCode,
        allowedDepositMethods:
          (biz as { allowedDepositMethods?: string[] }).allowedDepositMethods?.length
            ? (biz as { allowedDepositMethods?: string[] }).allowedDepositMethods
            : (biz as { allowedPaymentMethods?: string[] }).allowedPaymentMethods?.length
              ? (biz as { allowedPaymentMethods?: string[] }).allowedPaymentMethods
              : all,
        allowedWithdrawalMethods:
          (biz as { allowedWithdrawalMethods?: string[] }).allowedWithdrawalMethods?.length
            ? (biz as { allowedWithdrawalMethods?: string[] }).allowedWithdrawalMethods
            : (biz as { allowedPaymentMethods?: string[] }).allowedPaymentMethods?.length
              ? (biz as { allowedPaymentMethods?: string[] }).allowedPaymentMethods
              : all,
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
    delete base.phone;
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
