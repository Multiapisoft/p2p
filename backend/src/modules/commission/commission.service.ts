import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CommissionConfig, CommissionConfigDocument } from './schemas/commission.schema';
import {
  CreateCommissionDto,
  UpdateCommissionDto,
  UpsertBusinessCommissionsDto,
  CommissionRuleInputDto,
} from './dto/commission.dto';
import {
  CommissionAppliesTo,
  CommissionFeeMode,
  CommissionTarget,
} from '../../common/enums/commission-target.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { RedisService } from '../../redis/redis.service';
import { Business, BusinessDocument } from '../business/schemas/business.schema';
import { BusinessService } from '../business/business.service';
import { p2pPayQuotaRemaining } from '../business/utils/p2p-pay-quota.util';

export interface CommissionResult {
  amount: number;
  percentage: number;
  fixedFee: number;
  feeMode: CommissionFeeMode;
  configId?: string;
}

export type CommissionTxnKind = 'deposit' | 'withdrawal';

function ruleAppliesTo(
  config: CommissionConfigDocument,
  kind?: CommissionTxnKind,
): boolean {
  if (!kind) return true;
  const applies = config.appliesTo || CommissionAppliesTo.ALL;
  return applies === CommissionAppliesTo.ALL || applies === kind;
}

@Injectable()
export class CommissionService {
  constructor(
    @InjectModel(CommissionConfig.name)
    private commissionModel: Model<CommissionConfigDocument>,
    @InjectModel(Business.name)
    private businessModel: Model<BusinessDocument>,
    private redis: RedisService,
    private businessService: BusinessService,
  ) {}

  async create(dto: CreateCommissionDto) {
    const created = await this.commissionModel.create({
      ...dto,
      feeMode: dto.feeMode ?? CommissionFeeMode.BOTH,
      targetId: dto.targetId ? new Types.ObjectId(dto.targetId) : undefined,
    });
    await this.redis.delPattern('commission:*');
    return created;
  }

  async update(id: string, dto: UpdateCommissionDto) {
    const $set: Record<string, unknown> = { ...dto };
    const $unset: Record<string, 1> = {};
    if (dto.minAmount === null) {
      delete $set.minAmount;
      $unset.minAmount = 1;
    }
    if (dto.maxAmount === null) {
      delete $set.maxAmount;
      $unset.maxAmount = 1;
    }

    const update: Record<string, unknown> = { $set };
    if (Object.keys($unset).length) update.$unset = $unset;

    const config = await this.commissionModel.findByIdAndUpdate(id, update, { new: true }).exec();
    await this.redis.delPattern('commission:*');
    return config;
  }

  async findAll() {
    return this.commissionModel.find().sort({ targetType: 1, minAmount: 1 }).exec();
  }

  async findForTarget(targetType: CommissionTarget, targetId?: string) {
    const query: Record<string, unknown> = { targetType };
    if (targetId) query.targetId = new Types.ObjectId(targetId);
    else query.targetId = { $exists: false };
    return this.commissionModel.find(query).sort({ minAmount: 1, createdAt: 1 }).exec();
  }

  async getBusinessCommissions(businessId: string) {
    if (!Types.ObjectId.isValid(businessId)) {
      throw new BadRequestException('Invalid business id');
    }
    const [businessTake, investorBonus, business] = await Promise.all([
      this.findForTarget(CommissionTarget.BUSINESS, businessId),
      this.findForTarget(CommissionTarget.INVESTOR_BONUS, businessId),
      this.businessModel.findById(businessId).exec(),
    ]);

    const depositRules = businessTake.filter(
      (r) => (r.appliesTo || CommissionAppliesTo.ALL) === CommissionAppliesTo.DEPOSIT,
    );
    const withdrawalRules = businessTake.filter(
      (r) => (r.appliesTo || CommissionAppliesTo.ALL) === CommissionAppliesTo.WITHDRAWAL,
    );
    const legacyAll = businessTake.filter(
      (r) => !r.appliesTo || r.appliesTo === CommissionAppliesTo.ALL,
    );

    // Legacy "all" rules show in both editors until admin saves split rates.
    const businessTakeDeposit = depositRules.length ? depositRules : legacyAll;
    const businessTakeWithdrawal = withdrawalRules.length ? withdrawalRules : legacyAll;

    const limit = business?.p2pPayLimit || 0;
    const earned = business?.p2pPayEarned || 0;
    const used = business?.p2pPayUsed || 0;
    return {
      businessTake,
      businessTakeDeposit,
      businessTakeWithdrawal,
      investorBonus,
      p2pPayLimit: limit,
      p2pPayEarned: earned,
      p2pPayUsed: used,
      p2pPayRemaining: p2pPayQuotaRemaining({
        p2pPayLimit: limit,
        p2pPayEarned: earned,
        p2pPayUsed: used,
      }),
    };
  }

  async upsertBusinessCommissions(businessId: string, dto: UpsertBusinessCommissionsDto) {
    if (!Types.ObjectId.isValid(businessId)) {
      throw new BadRequestException('Invalid business id');
    }

    const results = {
      businessTake: [] as CommissionConfigDocument[],
      businessTakeDeposit: [] as CommissionConfigDocument[],
      businessTakeWithdrawal: [] as CommissionConfigDocument[],
      investorBonus: [] as CommissionConfigDocument[],
      p2pPayLimit: 0,
      p2pPayEarned: 0,
      p2pPayUsed: 0,
      p2pPayRemaining: 0 as number,
    };

    const hasSplit =
      dto.businessTakeDeposit != null || dto.businessTakeWithdrawal != null;

    if (hasSplit || dto.businessTake) {
      await this.commissionModel.deleteMany({
        targetType: CommissionTarget.BUSINESS,
        targetId: new Types.ObjectId(businessId),
      });

      if (hasSplit) {
        results.businessTakeDeposit = await this.insertTargetRules(
          CommissionTarget.BUSINESS,
          businessId,
          dto.businessTakeDeposit || [],
          'Business take (deposit)',
          CommissionAppliesTo.DEPOSIT,
        );
        results.businessTakeWithdrawal = await this.insertTargetRules(
          CommissionTarget.BUSINESS,
          businessId,
          dto.businessTakeWithdrawal || [],
          'Business take (withdrawal)',
          CommissionAppliesTo.WITHDRAWAL,
        );
        results.businessTake = [
          ...results.businessTakeDeposit,
          ...results.businessTakeWithdrawal,
        ];
      } else if (dto.businessTake) {
        // Legacy single list → apply to both deposit & withdrawal
        results.businessTake = await this.insertTargetRules(
          CommissionTarget.BUSINESS,
          businessId,
          dto.businessTake,
          'Business take',
          CommissionAppliesTo.ALL,
        );
        results.businessTakeDeposit = results.businessTake;
        results.businessTakeWithdrawal = results.businessTake;
      }

      const display =
        (dto.businessTakeDeposit || dto.businessTakeWithdrawal || dto.businessTake || []).find(
          (r) => !r.useRange,
        ) ??
        (dto.businessTakeDeposit || dto.businessTakeWithdrawal || dto.businessTake || [])[0];
      const rate =
        display &&
        (display.feeMode === CommissionFeeMode.PERCENTAGE ||
          display.feeMode === CommissionFeeMode.BOTH)
          ? display.percentage
          : 0;
      await this.businessModel.findByIdAndUpdate(businessId, { commissionRate: rate }).exec();
    }

    if (dto.investorBonus) {
      results.investorBonus = await this.replaceTargetRules(
        CommissionTarget.INVESTOR_BONUS,
        businessId,
        dto.investorBonus,
        'Investor bonus',
        CommissionAppliesTo.WITHDRAWAL,
      );
    }

    if (dto.p2pPayLimit != null) {
      await this.businessService.setP2pPayLimit(businessId, dto.p2pPayLimit, {
        referenceType: 'p2p_pay_limit_set',
        referenceId: businessId,
      });
    }

    const business = await this.businessModel.findById(businessId).exec();
    results.p2pPayLimit = business?.p2pPayLimit || 0;
    results.p2pPayEarned = business?.p2pPayEarned || 0;
    results.p2pPayUsed = business?.p2pPayUsed || 0;
    results.p2pPayRemaining = p2pPayQuotaRemaining({
      p2pPayLimit: results.p2pPayLimit,
      p2pPayEarned: results.p2pPayEarned,
      p2pPayUsed: results.p2pPayUsed,
    });

    await this.redis.delPattern('commission:*');
    return results;
  }

  private async insertTargetRules(
    targetType: CommissionTarget,
    targetId: string,
    rules: CommissionRuleInputDto[],
    label: string,
    appliesTo: CommissionAppliesTo,
  ) {
    for (const rule of rules) {
      this.validateRule(rule);
    }
    if (!rules.length) return [];

    const docs = await this.commissionModel.insertMany(
      rules.map((rule, index) => ({
        targetType,
        targetId: new Types.ObjectId(targetId),
        feeMode: rule.feeMode,
        percentage: rule.feeMode === CommissionFeeMode.FIXED ? 0 : rule.percentage,
        fixedFee: rule.feeMode === CommissionFeeMode.PERCENTAGE ? 0 : rule.fixedFee,
        minAmount: rule.useRange ? rule.minAmount : undefined,
        maxAmount: rule.useRange ? rule.maxAmount : undefined,
        appliesTo,
        isActive: rule.isActive ?? true,
        description:
          rule.description ||
          `${label}${rule.useRange ? ` (range ${rule.minAmount}-${rule.maxAmount})` : ''} #${index + 1}`,
      })),
    );

    return docs as CommissionConfigDocument[];
  }

  private async replaceTargetRules(
    targetType: CommissionTarget,
    targetId: string,
    rules: CommissionRuleInputDto[],
    label: string,
    appliesTo: CommissionAppliesTo = CommissionAppliesTo.ALL,
  ) {
    await this.commissionModel.deleteMany({
      targetType,
      targetId: new Types.ObjectId(targetId),
    });
    return this.insertTargetRules(targetType, targetId, rules, label, appliesTo);
  }

  private validateRule(rule: CommissionRuleInputDto) {
    if (rule.useRange) {
      if (rule.minAmount == null || rule.maxAmount == null) {
        throw new BadRequestException('Range requires minAmount and maxAmount');
      }
      if (rule.maxAmount < rule.minAmount) {
        throw new BadRequestException('maxAmount must be >= minAmount');
      }
    }
  }

  private matchesRange(config: CommissionConfigDocument, amount: number): boolean {
    const hasMin = config.minAmount != null;
    const hasMax = config.maxAmount != null;
    if (!hasMin && !hasMax) return true;
    if (hasMin && amount < (config.minAmount as number)) return false;
    if (hasMax && amount > (config.maxAmount as number)) return false;
    return true;
  }

  private pickBest(
    configs: CommissionConfigDocument[],
    amount: number,
    kind?: CommissionTxnKind,
  ): CommissionConfigDocument | null {
    const matching = configs.filter(
      (c) => this.matchesRange(c, amount) && ruleAppliesTo(c, kind),
    );
    if (!matching.length) return null;

    const ranged = matching.filter((c) => c.minAmount != null || c.maxAmount != null);
    const pool = ranged.length ? ranged : matching;

    pool.sort((a, b) => {
      // Prefer kind-specific rules over legacy "all"
      const specA =
        kind && (a.appliesTo || CommissionAppliesTo.ALL) === kind ? 0 : 1;
      const specB =
        kind && (b.appliesTo || CommissionAppliesTo.ALL) === kind ? 0 : 1;
      if (specA !== specB) return specA - specB;

      const spanA =
        a.minAmount != null && a.maxAmount != null
          ? a.maxAmount - a.minAmount
          : Number.MAX_SAFE_INTEGER;
      const spanB =
        b.minAmount != null && b.maxAmount != null
          ? b.maxAmount - b.minAmount
          : Number.MAX_SAFE_INTEGER;
      return spanA - spanB;
    });

    return pool[0] ?? null;
  }

  private computeAmount(config: CommissionConfigDocument, amount: number): number {
    const mode = config.feeMode || CommissionFeeMode.BOTH;
    const pct = config.percentage || 0;
    const fixed = config.fixedFee || 0;
    let total = 0;
    if (mode === CommissionFeeMode.PERCENTAGE || mode === CommissionFeeMode.BOTH) {
      total += (amount * pct) / 100;
    }
    if (mode === CommissionFeeMode.FIXED || mode === CommissionFeeMode.BOTH) {
      total += fixed;
    }
    return Math.round(total * 100) / 100;
  }

  private async fetchConfigs(
    targetType: CommissionTarget,
    targetId?: string,
    paymentMethod?: PaymentMethod,
  ) {
    const filter: Record<string, unknown> = { targetType, isActive: true };

    if (targetId) {
      filter.targetId = new Types.ObjectId(targetId);
    } else {
      filter.$or = [{ targetId: { $exists: false } }, { targetId: null }];
    }

    if (paymentMethod) {
      filter.paymentMethod = paymentMethod;
    } else {
      filter.$and = [
        {
          $or: [{ paymentMethod: { $exists: false } }, { paymentMethod: null }],
        },
      ];
    }

    return this.commissionModel.find(filter).exec();
  }

  async calculate(
    amount: number,
    targetType: CommissionTarget,
    targetId?: string,
    paymentMethod?: PaymentMethod,
    kind?: CommissionTxnKind,
  ): Promise<CommissionResult> {
    const empty: CommissionResult = {
      amount: 0,
      percentage: 0,
      fixedFee: 0,
      feeMode: CommissionFeeMode.BOTH,
    };

    const buckets: CommissionConfigDocument[][] = [];

    if (targetId && paymentMethod) {
      buckets.push(await this.fetchConfigs(targetType, targetId, paymentMethod));
    }
    if (targetId) {
      buckets.push(await this.fetchConfigs(targetType, targetId, undefined));
    }
    if (paymentMethod) {
      buckets.push(await this.fetchConfigs(targetType, undefined, paymentMethod));
    }
    buckets.push(await this.fetchConfigs(targetType, undefined, undefined));

    let config: CommissionConfigDocument | null = null;
    for (const bucket of buckets) {
      config = this.pickBest(bucket, amount, kind);
      if (config) break;
    }

    if (!config) return empty;

    return {
      amount: this.computeAmount(config, amount),
      percentage: config.percentage || 0,
      fixedFee: config.fixedFee || 0,
      feeMode: config.feeMode || CommissionFeeMode.BOTH,
      configId: config._id?.toString(),
    };
  }
}
