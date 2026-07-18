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
import { UserDocument } from './schemas/user.schema';
import { IntegrationRegisterUserDto } from '../business/dto/integration.dto';
import { partnerUserIdFromExternalRef } from '../integration/utils/partner-user-id.util';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';

export type UserListOpts = ListQueryOpts & { role?: string };

@Injectable()
export class UsersService {
  constructor(
    private usersRepo: UsersRepository,
    @InjectModel(Business.name) private businessModel: Model<BusinessDocument>,
  ) {}

  async create(dto: CreateUserDto, createdBy?: string) {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    let referredByBusiness: string | undefined;

    if (dto.referralCode) {
      const business = await this.businessModel
        .findOne({ referralCode: dto.referralCode, status: UserStatus.ACTIVE })
        .exec();
      if (!business) throw new BadRequestException('Invalid referral code');
      referredByBusiness = business._id.toString();
    } else if (dto.businessId) {
      const business = await this.businessModel.findById(dto.businessId).exec();
      if (!business) throw new BadRequestException('Invalid business');
      referredByBusiness = business._id.toString();
    }

    const user = await this.usersRepo.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
      phone: dto.phone,
      role: dto.role || UserRole.USER,
      referredByBusiness: referredByBusiness as unknown as import('mongoose').Types.ObjectId,
      createdBy: createdBy as unknown as import('mongoose').Types.ObjectId,
      permissions: dto.permissions || [],
    });

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
    return this.sanitize(user);
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
      items: items.map((u) => this.sanitize(u)),
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

  private sanitize(user: UserDocument) {
    const obj = user.toObject() as unknown as Record<string, unknown>;
    delete obj.password;
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
      /** Partner platform user id (e.g. Bitfarming Mongo _id) parsed from externalRef */
      partnerUserId: partnerUserIdFromExternalRef(externalRef),
      mustSetPassword: !!base.mustSetPassword,
    };
  }
}
