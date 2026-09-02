import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LedgerEntry, LedgerEntryDocument } from './schemas/ledger.schema';
import {
  Currency,
  LedgerDirection,
  LedgerFlow,
  LedgerType,
} from '../../common/enums/currency.enum';
import {
  listSortMap,
  normalizeListOpts,
  type ListQueryOpts,
} from '../../common/dto/list-query.dto';
import { stripFeeCutFromDescription } from '../wallet/utils/platform-commission-ledger.util';

export interface CreateLedgerParams {
  userId: string;
  walletId?: string;
  type: LedgerType;
  direction?: LedgerDirection;
  flow?: LedgerFlow;
  amount: number;
  currency?: Currency;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  description?: string;
  businessId?: string;
  counterpartyUserId?: string;
  fromParty?: string;
  toParty?: string;
}

export type TransactionListOpts = ListQueryOpts & {
  type?: string;
  userId?: string;
  direction?: string;
  businessId?: string;
  /**
   * Business portal statement: owner wallet/limit rows PLUS this business's
   * users' deposit / withdrawal / investment / redemption lines.
   */
  businessLedgerOwnerId?: string;
  businessLedgerBusinessId?: string;
  /** When true, strip fee-cut wording (user/investor self ledger). */
  hideFeeCuts?: boolean;
  /** When true, hide paired P2P fee wallet debits (limit row is the single business line). */
  hideP2pFeeDuplicates?: boolean;
};

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(LedgerEntry.name) private ledgerModel: Model<LedgerEntryDocument>,
  ) {}

  async record(params: CreateLedgerParams) {
    const direction =
      params.direction ??
      (params.balanceAfter >= params.balanceBefore
        ? LedgerDirection.CREDIT
        : LedgerDirection.DEBIT);

    return this.ledgerModel.create({
      ...params,
      direction,
      userId: params.userId,
      walletId: params.walletId,
      counterpartyUserId: params.counterpartyUserId,
      businessId: params.businessId,
    });
  }

  async findByUser(userId: string, opts: TransactionListOpts = {}) {
    return this.findAll({ ...opts, userId });
  }

  /** Owner wallet/limit + users' deposit/WD activity for one business. */
  async findForBusinessLedger(
    ownerUserId: string,
    businessId: string,
    opts: TransactionListOpts = {},
  ) {
    return this.findAll({
      ...opts,
      businessLedgerOwnerId: ownerUserId,
      businessLedgerBusinessId: businessId,
    });
  }

  async findAll(opts: TransactionListOpts = {}) {
    const { page, limit, skip, search, sort } = normalizeListOpts(opts);
    const and: Record<string, unknown>[] = [];

    if (opts.businessLedgerOwnerId && opts.businessLedgerBusinessId) {
      const ownerId = opts.businessLedgerOwnerId;
      const bid = opts.businessLedgerBusinessId;
      const ownerMatch = Types.ObjectId.isValid(ownerId)
        ? { $or: [{ userId: new Types.ObjectId(ownerId) }, { userId: ownerId }] }
        : { userId: ownerId };
      const bizMatch = Types.ObjectId.isValid(bid)
        ? { $or: [{ businessId: new Types.ObjectId(bid) }, { businessId: bid }] }
        : { businessId: bid };
      const ownerNe = Types.ObjectId.isValid(ownerId)
        ? { userId: { $nin: [new Types.ObjectId(ownerId), ownerId] } }
        : { userId: { $ne: ownerId } };
      and.push({
        $or: [
          ownerMatch,
          {
            $and: [
              bizMatch,
              ownerNe,
              {
                type: {
                  $in: [
                    LedgerType.DEPOSIT,
                    LedgerType.WITHDRAWAL,
                    LedgerType.INVESTMENT,
                    LedgerType.REDEMPTION,
                  ],
                },
              },
            ],
          },
        ],
      });
    } else {
      if (opts.userId) {
        const uid = opts.userId;
        and.push(
          Types.ObjectId.isValid(uid)
            ? { $or: [{ userId: new Types.ObjectId(uid) }, { userId: uid }] }
            : { userId: uid },
        );
      }
      if (opts.businessId) {
        const bid = opts.businessId;
        and.push(
          Types.ObjectId.isValid(bid)
            ? { $or: [{ businessId: new Types.ObjectId(bid) }, { businessId: bid }] }
            : { businessId: bid },
        );
      }
    }
    if (opts.direction && opts.direction !== 'all') {
      and.push({ direction: opts.direction });
    }
    if (opts.type && opts.type !== 'all') {
      if (opts.type === LedgerDirection.CREDIT || opts.type === LedgerDirection.DEBIT) {
        and.push({ direction: opts.type });
      } else {
        and.push({ type: opts.type });
      }
    }
    if (search) {
      and.push({
        $or: [
          { referenceId: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { referenceType: { $regex: search, $options: 'i' } },
          { fromParty: { $regex: search, $options: 'i' } },
          { toParty: { $regex: search, $options: 'i' } },
        ],
      });
    }

    if (opts.hideP2pFeeDuplicates) {
      // P2P payment fees write both a wallet debit (commission) and a pay-limit deduct.
      // Business ledger shows only the limit row — same amount, clearer for operators.
      and.push({
        $nor: [
          {
            type: LedgerType.COMMISSION,
            flow: LedgerFlow.PLATFORM_FEE,
            direction: LedgerDirection.DEBIT,
            referenceType: 'withdrawal_payment',
          },
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
      this.ledgerModel
        .find(filter)
        .populate('userId', 'name email role')
        .populate('counterpartyUserId', 'name email role')
        .skip(skip)
        .limit(limit)
        .sort(sortSpec)
        .exec(),
      this.ledgerModel.countDocuments(filter).exec(),
    ]);

    const mapped = opts.hideFeeCuts
      ? items.map((row) => {
          const obj = row.toObject() as unknown as Record<string, unknown>;
          const desc = stripFeeCutFromDescription(
            typeof obj.description === 'string' ? obj.description : undefined,
          );
          // Never expose platform/business fee flow labels on payer ledgers.
          if (
            obj.flow === LedgerFlow.PLATFORM_FEE ||
            (typeof obj.description === 'string' &&
              /platform fee|business fee|deposit fee|withdrawal fee|fee cut/i.test(obj.description))
          ) {
            return {
              ...obj,
              description: desc,
              flow: obj.flow === LedgerFlow.PLATFORM_FEE ? undefined : obj.flow,
            };
          }
          return { ...obj, description: desc };
        })
      : items;

    return {
      items: mapped,
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
