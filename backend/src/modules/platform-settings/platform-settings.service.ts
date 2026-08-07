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
    if (cached) return cached;

    let settings = await this.settingsModel.findOne().exec();
    if (!settings) {
      settings = await this.settingsModel.create({});
    }

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
    return settings.investorClaimLockMinutes * 60 * 1000;
  }

  async getPaySubmitMs(): Promise<number> {
    const settings = await this.get();
    return settings.investorPaySubmitMinutes * 60 * 1000;
  }

  async getTatMs(): Promise<number> {
    const settings = await this.get();
    return settings.withdrawalUserEditTatMinutes * 60 * 1000;
  }
}
