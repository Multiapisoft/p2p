/**
 * Disputed pending pays must keep WD open slot + list pay-limit locked
 * until admin resolves (approve / reject). Do not free reservedAmount on raise.
 */

export function shouldFreeReservedOnDispute(): boolean {
  return false;
}

/** Pending payments that still occupy WD reserved / block unlist-reject. */
export function pendingHoldsWdSlot(payment: {
  status?: string | null;
  disputedAt?: Date | null;
}): boolean {
  const status = String(payment.status || '').toLowerCase();
  return status === 'pending';
}

/**
 * List-time p2pPayUsed hold for a listed WD while any disputed pending remains.
 * unpaid principal stays held; disputed amount is part of unpaid until settle/reject.
 */
export function disputedKeepsListQuotaLocked(opts: {
  listed: boolean;
  unpaidPrincipalInr: number;
  disputedPendingInr: number;
}): boolean {
  if (!opts.listed) return false;
  if (opts.disputedPendingInr > 0) return true;
  return opts.unpaidPrincipalInr > 0;
}
