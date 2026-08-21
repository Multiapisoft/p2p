import { Types } from 'mongoose';

type MethodDetails = {
  upiDetails?: { upiId?: string; payerName?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string };
};

export type SavedWithdrawalMethodView = {
  _id: string;
  label: string;
  method: 'upi' | 'bank' | 'usdt';
  isDefault: boolean;
  upiDetails?: MethodDetails['upiDetails'];
  bankDetails?: MethodDetails['bankDetails'];
  usdtDetails?: MethodDetails['usdtDetails'];
  createdAt: string;
  updatedAt: string;
};

export function buildSavedWithdrawalMethodLabel(
  input: Pick<SavedWithdrawalMethodView, 'method' | 'upiDetails' | 'bankDetails' | 'usdtDetails'>,
  customLabel?: string,
) {
  const label = customLabel?.trim();
  if (label) return label;
  if (input.method === 'upi') return `UPI - ${input.upiDetails?.upiId || 'saved'}`;
  if (input.method === 'bank') {
    const acct = input.bankDetails?.accountNumber || '';
    return `Bank - XXXX${acct.slice(-4) || '0000'}`;
  }
  return `USDT - ${input.usdtDetails?.network || 'TRC20'}`;
}

export function ensureSavedMethodDefault(methods: SavedWithdrawalMethodView[]) {
  if (!methods.length) return methods;
  if (methods.some((m) => m.isDefault)) return methods;
  return methods.map((m, ix) => ({ ...m, isDefault: ix === 0 }));
}

export const MAX_SAVED_WITHDRAWAL_METHODS = 20;

export function upsertSavedWithdrawalMethod(
  methods: SavedWithdrawalMethodView[],
  next: Omit<SavedWithdrawalMethodView, '_id' | 'createdAt' | 'updatedAt'>,
  now: string,
  methodId?: string,
) {
  if (methodId) {
    const ix = methods.findIndex((m) => m._id === methodId);
    if (ix < 0) return null;
    const updated = methods.map((m) => ({ ...m, isDefault: next.isDefault ? false : m.isDefault }));
    updated[ix] = {
      ...updated[ix],
      ...next,
      _id: updated[ix]._id,
      createdAt: updated[ix].createdAt,
      updatedAt: now,
    };
    return ensureSavedMethodDefault(updated);
  }
  const created: SavedWithdrawalMethodView = {
    _id: new Types.ObjectId().toString(),
    createdAt: now,
    updatedAt: now,
    ...next,
  };
  const out = next.isDefault ? methods.map((m) => ({ ...m, isDefault: false })) : [...methods];
  return ensureSavedMethodDefault([...out, created]);
}

export function deleteSavedWithdrawalMethod(
  methods: SavedWithdrawalMethodView[],
  methodId: string,
) {
  const next = methods.filter((m) => m._id !== methodId);
  if (next.length === methods.length) return null;
  return ensureSavedMethodDefault(next);
}

