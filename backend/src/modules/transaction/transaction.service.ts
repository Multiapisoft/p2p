import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LedgerEntry, LedgerEntryDocument } from './schemas/ledger.schema';
import { LedgerType } from '../../common/enums/currency.enum';
import { Currency } from '../../common/enums/currency.enum';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';

export interface CreateLedgerParams {
  userId: string;
  walletId?: string;
  type: LedgerType;
  amount: number;
  currency?: Currency;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  description?: string;
  businessId?: string;
}

export type TransactionListOpts = ListQueryOpts & {
  type?: string;
  userId?: string;
};

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(LedgerEntry.name) private ledgerModel: Model<LedgerEntryDocument>,
  ) {}

  async record(params: CreateLedgerParams) {
    return this.ledgerModel.create(params);
  }

  async findByUser(userId: string, opts: TransactionListOpts = {}) {
    return this.findAll({ ...opts, userId });
  }

  async findAll(opts: TransactionListOpts = {}) {
    const { page, limit, skip, search, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [];

    if (opts.userId) {
      const uid = opts.userId;
      and.push(
        Types.ObjectId.isValid(uid)
          ? { $or: [{ userId: new Types.ObjectId(uid) }, { userId: uid }] }
          : { userId: uid },
      );
    }
    if (opts.type && opts.type !== 'all') {
      and.push({ type: opts.type });
    }
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { referenceType: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};
    const sortSpec = listSortMap(sort, {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      amount_desc: { amount: -1 },
      amount_asc: { amount: 1 },
      status: { type: 1, createdAt: -1 },
    });

    const [items, total] = await Promise.all([
      this.ledgerModel.find(filter).skip(skip).limit(limit).sort(sortSpec).exec(),
      this.ledgerModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async findByReference(referenceType: string, referenceId: string) {
    return this.ledgerModel.find({ referenceType, referenceId }).exec();
  }
}
