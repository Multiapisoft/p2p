import { BadRequestException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { WithdrawalPaymentDocument } from '../schemas/withdrawal-payment.schema';
import { WithdrawalDocument } from '../schemas/withdrawal.schema';

const ACTIVE_STATUSES = [
  TransactionStatus.PENDING,
  TransactionStatus.PROCESSING,
  TransactionStatus.COMPLETED,
];

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function oidOrRaw(id?: string) {
  if (!id) return undefined;
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
}

/**
 * UTR / TxID must be unique across Platform Payments and withdrawal approvals.
 */
export async function assertUniquePaymentRef(opts: {
  paymentModel: Model<WithdrawalPaymentDocument>;
  withdrawalModel: Model<WithdrawalDocument>;
  ref: string;
  isUsdt?: boolean;
  excludePaymentId?: string;
  excludeWithdrawalId?: string;
}): Promise<void> {
  const ref = opts.ref?.trim();
  if (!ref) return;

  const pattern = new RegExp(`^${escapeRegex(ref)}$`, 'i');
  const duplicateMsg = opts.isUsdt
    ? 'This USDT / TRX TxID is already used. Enter a unique transaction hash.'
    : 'This UTR is already used. Enter a unique UTR number.';

  const payFilter: Record<string, unknown> = {
    utr: pattern,
    status: { $in: ACTIVE_STATUSES },
  };
  const excludePay = oidOrRaw(opts.excludePaymentId);
  if (excludePay) payFilter._id = { $ne: excludePay };

  if (await opts.paymentModel.exists(payFilter)) {
    throw new BadRequestException(duplicateMsg);
  }

  const wdOr = opts.isUsdt
    ? [{ 'usdtDetails.txHash': pattern }]
    : [{ 'upiDetails.utr': pattern }, { 'bankDetails.utr': pattern }];

  const wdFilter: Record<string, unknown> = {
    status: { $in: ACTIVE_STATUSES },
    $or: wdOr,
  };
  const excludeWd = oidOrRaw(opts.excludeWithdrawalId);
  if (excludeWd) wdFilter._id = { $ne: excludeWd };

  if (await opts.withdrawalModel.exists(wdFilter)) {
    throw new BadRequestException(duplicateMsg);
  }
}
