export type P2pPayQuotaLedgerAction = 'set' | 'add' | 'deduct' | 'release';

/** Why quota was added/deducted — drives business-ledger remark text. */
export type P2pPayQuotaLedgerReason =
  | 'user_deposit'
  | 'user_pay_cross_biz'
  | 'list_reserve'
  | 'list_release'
  | 'wd_fee'
  | 'deposit_fee';

export type P2pPayQuotaRef = {
  referenceType?: string;
  referenceId?: string;
  reason?: P2pPayQuotaLedgerReason;
};

export function p2pPayQuotaLedgerDescription(params: {
  action: P2pPayQuotaLedgerAction;
  amount: number;
  remainingBefore: number;
  remainingAfter: number;
  seedBefore?: number;
  seedAfter?: number;
  /** Fee deducted from limit and credited to admin (P2P payment settlement). */
  feeToAdmin?: boolean;
  reason?: P2pPayQuotaLedgerReason;
}): string {
  const rem = `Remaining ₹${params.remainingBefore} → ₹${params.remainingAfter}`;
  if (params.action === 'set') {
    return `P2P pay limit set ₹${params.seedBefore ?? 0} → ₹${params.seedAfter ?? 0}. ${rem}`;
  }
  if (params.action === 'release' || params.reason === 'list_release') {
    return `P2P list reserve released ₹${params.amount} (withdrawal paid). ${rem}`;
  }
  if (params.action === 'add') {
    if (params.reason === 'user_deposit') {
      return `P2P pay limit earned ₹${params.amount} (user deposit). ${rem}`;
    }
    if (params.reason === 'user_pay_cross_biz') {
      return `P2P pay limit earned ₹${params.amount} (user paid other business). ${rem}`;
    }
    return `P2P pay limit added ₹${params.amount}. ${rem}`;
  }
  if (params.reason === 'list_reserve') {
    return `P2P list reserve ₹${params.amount} (withdrawal listed). ${rem}`;
  }
  if (params.reason === 'wd_fee') {
    return `P2P pay limit deducted ₹${params.amount} (withdrawal fee to admin). ${rem}`;
  }
  if (params.reason === 'deposit_fee') {
    return `P2P pay limit deducted ₹${params.amount} (deposit fee to admin). ${rem}`;
  }
  const adminNote = params.feeToAdmin ? ' (fee to admin)' : '';
  return `P2P pay limit deducted ₹${params.amount}${adminNote}. ${rem}`;
}
