import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private redis: RedisService,
  ) {}

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
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
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
      this.userModel.find(filter).skip(skip).limit(limit).sort(sort).exec(),
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

  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(`user:${id}`);
  }
}
