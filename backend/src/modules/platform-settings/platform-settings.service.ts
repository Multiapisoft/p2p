import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformSettings,
  PlatformSettingsDocument,
} from './schemas/platform-settings.schema';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto';
import { RedisService } from '../../redis/redis.service';

const CACHE_KEY = 'platform-settings';
const CACHE_TTL_SECONDS = 60;

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectModel(PlatformSettings.name)
    private settingsModel: Model<PlatformSettingsDocument>,
    private redis: RedisService,
  ) {}

  async get(): Promise<PlatformSettingsDocument | PlatformSettings> {
    const cached = await this.redis.get<PlatformSettings>(CACHE_KEY);
    if (
      cached &&
      Number(cached.minTransactionAmount) >= 300 &&
      Number(cached.investorClaimLockMinutes) >= 1 &&
      Number(cached.investorPaySubmitMinutes) >= 1
    ) {
      return cached;
    }

    let settings = await this.settingsModel.findOne().exec();
    if (!settings) {
      settings = await this.settingsModel.create({
        minTransactionAmount: 300,
        investorClaimLockMinutes: 7,
        investorPaySubmitMinutes: 5,
      });
    }

    let dirty = false;
    const current = Number(settings.minTransactionAmount);
    if (!Number.isFinite(current) || current < 300) {
      settings.minTransactionAmount = 300;
      dirty = true;
    }
    if (!Number.isFinite(Number(settings.investorClaimLockMinutes)) || Number(settings.investorClaimLockMinutes) < 1) {
      settings.investorClaimLockMinutes = 7;
      dirty = true;
    }
    if (!Number.isFinite(Number(settings.investorPaySubmitMinutes)) || Number(settings.investorPaySubmitMinutes) < 1) {
      settings.investorPaySubmitMinutes = 5;
      dirty = true;
    }
    if (dirty) await settings.save();

    await this.redis.set(CACHE_KEY, settings.toObject(), CACHE_TTL_SECONDS);
    return settings;
  }

  async update(dto: UpdatePlatformSettingsDto): Promise<PlatformSettingsDocument> {
    const settings = await this.settingsModel
      .findOneAndUpdate({}, { $set: dto }, { new: true, upsert: true, setDefaultsOnInsert: true })
      .exec();

    await this.redis.del(CACHE_KEY);
    return settings!;
  }

  async getClaimLockMs(): Promise<number> {
    const settings = await this.get();
    const n = Number(settings.investorClaimLockMinutes);
    return (Number.isFinite(n) && n >= 1 ? n : 7) * 60 * 1000;
  }

  async getPaySubmitMs(): Promise<number> {
    const settings = await this.get();
    const n = Number(settings.investorPaySubmitMinutes);
    return (Number.isFinite(n) && n >= 1 ? n : 5) * 60 * 1000;
  }

  async getTatMs(): Promise<number> {
    const settings = await this.get();
    return settings.withdrawalUserEditTatMinutes * 60 * 1000;
  }

  async getMinTransactionAmount(): Promise<number> {
    const settings = await this.get();
    const n = Number(settings.minTransactionAmount);
    if (!Number.isFinite(n) || n < 300) return 300;
    return n;
  }

  async allowPartialPay(): Promise<boolean> {
    const settings = await this.get();
    return settings.allowPartialPay !== false;
  }

  async preferB2bSettlement(): Promise<boolean> {
    const settings = await this.get();
    return settings.preferB2bSettlement !== false;
  }

  async getCdmHoldMs(): Promise<number> {
    const settings = await this.get();
    const n = Number(settings.cdmHoldMinutes);
    return (Number.isFinite(n) && n >= 1 ? n : 30) * 60 * 1000;
  }
}
