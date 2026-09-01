export type P2pPayQuotaLedgerAction = 'set' | 'add' | 'deduct';

export type P2pPayQuotaRef = {
  referenceType?: string;
  referenceId?: string;
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
}): string {
  const rem = `Remaining ₹${params.remainingBefore} → ₹${params.remainingAfter}`;
  if (params.action === 'set') {
    return `P2P pay limit set ₹${params.seedBefore ?? 0} → ₹${params.seedAfter ?? 0}. ${rem}`;
  }
  if (params.action === 'add') {
    return `P2P pay limit added ₹${params.amount}. ${rem}`;
  }
  const adminNote = params.feeToAdmin ? ' (fee to admin)' : '';
  return `P2P pay limit deducted ₹${params.amount}${adminNote}. ${rem}`;
}
