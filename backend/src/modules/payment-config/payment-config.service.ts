import { BadRequestException, Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaymentConfig, PaymentConfigDocument } from './schemas/payment-config.schema';
import { CreatePaymentConfigDto, UpdatePaymentConfigDto } from './dto/payment-config.dto';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { Currency } from '../../common/enums/currency.enum';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class PaymentConfigService implements OnModuleInit {
  private readonly logger = new Logger(PaymentConfigService.name);

  constructor(
    @InjectModel(PaymentConfig.name) private configModel: Model<PaymentConfigDocument>,
    private redis: RedisService,
  ) {}

  async onModuleInit() {
    const count = await this.configModel.countDocuments().exec();
    if (count > 0) return;

    await this.configModel.insertMany([
      {
        method: PaymentMethod.UPI,
        currency: Currency.INR,
        label: 'Platform UPI',
        details: { upiId: 'platform@upi', displayName: 'P2P Platform' },
        instructions: 'Send payment to the UPI ID and submit UTR',
      },
      {
        method: PaymentMethod.BANK,
        currency: Currency.INR,
        label: 'Platform Bank Account',
        details: {
          accountNumber: '0000000000',
          ifscCode: 'SBIN0000000',
          accountHolderName: 'P2P Platform Pvt Ltd',
          bankName: 'State Bank of India',
        },
        instructions: 'Transfer to bank account and submit UTR',
      },
      {
        method: PaymentMethod.USDT,
        currency: Currency.USDT,
        label: 'Platform USDT Wallet',
        details: { walletAddress: 'TXxx...platform', network: 'TRC20' },
        instructions: 'Send USDT to platform wallet and submit tx hash',
      },
    ]);
    this.logger.log('Default payment configs seeded');
  }

  async create(dto: CreatePaymentConfigDto) {
    const config = await this.configModel.create(dto);
    await this.redis.del('payment-configs:active');
    return config;
  }

  async update(id: string, dto: UpdatePaymentConfigDto) {
    const config = await this.configModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!config) throw new NotFoundException('Payment config not found');
    await this.redis.del('payment-configs:active');
    return config;
  }

  async findAll() {
    return this.configModel.find().sort({ method: 1 }).exec();
  }

  async findActive() {
    const cached = await this.redis.get<PaymentConfigDocument[]>('payment-configs:active');
    if (cached) return cached;
    const configs = await this.configModel.find({ isActive: true }).exec();
    await this.redis.set('payment-configs:active', configs.map((c) => c.toObject()), 600);
    return configs;
  }

  async findByMethod(method: PaymentMethod, currency = Currency.INR) {
    const config = await this.configModel.findOne({ method, currency, isActive: true }).exec();
    if (!config) throw new NotFoundException(`Payment method ${method} not configured`);
    return config;
  }

  validateAmount(config: PaymentConfigDocument, amount: number) {
    if (amount < config.minAmount || amount > config.maxAmount) {
      throw new BadRequestException(
        `Amount must be between ${config.minAmount} and ${config.maxAmount}`,
      );
    }
  }
}
