import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { RedisService } from '../../redis/redis.service';
import { UserRole } from '../../common/enums/role.enum';

@Injectable()
export class UsersRepository implements OnModuleInit {
  private readonly logger = new Logger(UsersRepository.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private redis: RedisService,
  ) {}

  /** Drop legacy sparse unique index that collided on externalRef: null */
  async onModuleInit() {
    try {
      const indexes = await this.userModel.collection.indexes();
      const legacy = indexes.find(
        (idx) =>
          idx.name === 'referredByBusiness_1_externalRef_1' &&
          !(idx as { partialFilterExpression?: unknown }).partialFilterExpression,
      );
      if (legacy?.name) {
        await this.userModel.collection.dropIndex(legacy.name);
        this.logger.log(`Dropped legacy index ${legacy.name}`);
      }
      await this.userModel.syncIndexes();
    } catch (err) {
      this.logger.warn(
        `Could not migrate users externalRef index: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    const user = await this.userModel.create(data);
    return user;
  }

  async findById(id: string): Promise<UserDocument | null> {
    const cached = await this.redis.get<UserDocument>(`user:${id}`);
    if (cached) return cached;

    const user = await this.userModel.findById(id).exec();
    if (user) await this.redis.set(`user:${id}`, user.toObject());
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findByReferralCode(code: string): Promise<UserDocument | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.userModel
      .findOne({
        referralCode: { $regex: `^${escaped}$`, $options: 'i' },
        role: UserRole.INVESTOR,
      })
      .exec();
  }

  async findByEmailWithSecrets(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+twoFactorSecret')
      .exec();
  }

  async findByEmailWithReset(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordResetCodeHash +passwordResetExpires')
      .exec();
  }

  async findByIdWithSecrets(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+twoFactorSecret').exec();
  }

  /** Match phone with flexible formatting (+91 / 91 / 10-digit). */
  async findByPhone(phone: string): Promise<UserDocument | null> {
    const raw = phone.trim();
    if (!raw) return null;

    const digits = raw.replace(/\D/g, '');
    const variants = new Set<string>([raw]);
    if (digits) {
      variants.add(digits);
      if (digits.length === 10) {
        variants.add(`+91${digits}`);
        variants.add(`91${digits}`);
        variants.add(`0${digits}`);
      }
      if (digits.length === 12 && digits.startsWith('91')) {
        const local = digits.slice(2);
        variants.add(local);
        variants.add(`+${digits}`);
        variants.add(`+91${local}`);
      }
      if (digits.length === 11 && digits.startsWith('0')) {
        const local = digits.slice(1);
        variants.add(local);
        variants.add(`+91${local}`);
        variants.add(`91${local}`);
      }
    }

    const exact = await this.userModel
      .findOne({ phone: { $in: [...variants] } })
      .exec();
    if (exact) return exact;

    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      return this.userModel
        .findOne({ phone: { $regex: `${last10}$` } })
        .exec();
    }
    return null;
  }

  async findByExternalRefForBusiness(
    businessId: string,
    externalRef: string,
  ): Promise<UserDocument | null> {
    const ref = externalRef.trim();
    if (!ref || !Types.ObjectId.isValid(businessId)) return null;

    const businessOid = new Types.ObjectId(businessId);

    // Prefer compound match; fall back to ref-only then ownership check
    // (avoids rare string/ObjectId cast misses on referredByBusiness).
    const direct = await this.userModel
      .findOne({ referredByBusiness: businessOid, externalRef: ref })
      .exec();
    if (direct) return direct;

    const byRef = await this.userModel.findOne({ externalRef: ref }).exec();
    if (byRef && byRef.referredByBusiness?.toString() === businessId) {
      return byRef;
    }
    return null;
  }

  async findAll(
    filter: Record<string, unknown>,
    skip: number,
    limit: number,
    sort: Record<string, 1 | -1> = { createdAt: -1 },
  ) {
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .populate('referredByBusiness', 'name referralCode')
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async update(id: string, data: Partial<User>): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    await this.redis.del(`user:${id}`);
    return user;
  }

  async resetPasswordAfterCode(id: string, hashedPassword: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: { password: hashedPassword, mustSetPassword: false },
          $unset: { passwordResetCodeHash: 1, passwordResetExpires: 1 },
        },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException('User not found');
    await this.redis.del(`user:${id}`);
    return user;
  }

  async clearTwoFactor(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { twoFactorEnabled: false }, $unset: { twoFactorSecret: 1 } },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException('User not found');
    await this.redis.del(`user:${id}`);
    return user;
  }

  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(`user:${id}`);
  }
}
