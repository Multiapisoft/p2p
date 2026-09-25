export type P2pPayQuotaLedgerAction = 'set' | 'add' | 'deduct' | 'release';

/** Why quota was added/deducted — drives business-ledger remark text. */
export type P2pPayQuotaLedgerReason =
  | 'user_deposit'
  | 'user_pay_cross_biz'
  | 'list_reserve'
  | 'list_release'
  | 'reject_refund'
  | 'wd_fee'
  | 'deposit_fee'
  | 'business_wd_hold'
  | 'business_wd_hold_release'
  | 'business_reset';

/**
 * Skip only list_release churn (pay settle returns reserve silently).
 * list_reserve + wd_fee write on Approve so business sees limit + fee immediately.
 * reject_refund writes on reject/unlist so remaining limit + unused fee show as restored.
 */
export function shouldSkipInProcessQuotaLedger(
  reason?: P2pPayQuotaLedgerReason | string | null,
): boolean {
  return reason === 'list_release';
}

/**
 * Legacy in-process refs (no longer written). Kept for filtering old rows only.
 * New reject/unlist refunds use `withdrawal_reject_refund` / `withdrawal_unlist_refund`
 * / `withdrawal_cancel_refund` which stay visible.
 */
export const IN_PROCESS_P2P_QUOTA_LEDGER_REFS = [
  'withdrawal_unlist',
  'withdrawal_reject',
  'withdrawal_cancel',
] as const;

export function isInProcessP2pQuotaLedgerRef(
  referenceType?: string | null,
): boolean {
  return (IN_PROCESS_P2P_QUOTA_LEDGER_REFS as readonly string[]).includes(
    referenceType || '',
  );
}

export type P2pPayQuotaRef = {
  referenceType?: string;
  referenceId?: string;
  reason?: P2pPayQuotaLedgerReason;
  /**
   * When consuming after a business-origin WD is marked COMPLETED, pass the
   * gross WD amount so remainingBefore still counts the open hold that just ended.
   */
  holdRelease?: number;
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
    if (params.reason === 'business_reset') {
      return `P2P pay limit reset ₹${params.seedBefore ?? 0} → ₹${params.seedAfter ?? 0}. ${rem}`;
    }
    return `P2P pay limit set ₹${params.seedBefore ?? 0} → ₹${params.seedAfter ?? 0}. ${rem}`;
  }
  if (params.reason === 'reject_refund') {
    return `P2P pay limit refunded ₹${params.amount} (remaining after reject/unlist). ${rem}`;
  }
  if (params.action === 'release' || params.reason === 'list_release') {
    if (params.reason === 'business_wd_hold_release') {
      return `P2P pay limit hold released ₹${params.amount} (business withdrawal cancelled). ${rem}`;
    }
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
  if (params.reason === 'business_wd_hold') {
    return `P2P pay limit held ₹${params.amount} (business withdrawal open). ${rem}`;
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
