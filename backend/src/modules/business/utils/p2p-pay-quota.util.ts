/** Admin seed + deposit-earned quota vs used/hold. */

export function p2pPayQuotaCap(p2pPayLimit?: number | null, p2pPayEarned?: number | null) {
  const seed = Math.max(0, Number(p2pPayLimit) || 0);
  const earned = Math.max(0, Number(p2pPayEarned) || 0);
  return Math.round((seed + earned) * 100) / 100;
}

/**
 * Remaining INR the business can still withdraw / that can be paid toward it.
 * Cap = admin seed + deposits (users or business-funded). Remaining = cap − used − hold.
 * Never unlimited — 0 seed and 0 earned means ₹0 remaining.
 */
export function p2pPayQuotaRemaining(opts: {
  p2pPayLimit?: number | null;
  p2pPayEarned?: number | null;
  p2pPayUsed?: number | null;
  hold?: number | null;
}): number {
  const seed = Math.max(0, Number(opts.p2pPayLimit) || 0);
  const earned = Math.max(0, Number(opts.p2pPayEarned) || 0);
  const used = Math.max(0, Number(opts.p2pPayUsed) || 0);
  const hold = Math.max(0, Number(opts.hold) || 0);
  const cap = p2pPayQuotaCap(seed, earned);
  return Math.round(Math.max(0, cap - used - hold) * 100) / 100;
}

/**
 * Paying a listed WD fills quota already reserved at list time.
 * Add that reserved principal back so submit is not blocked by the list reserve.
 */
export function remainingForPayingListedWithdrawal(
  remainingAfterListReserve: number,
  listedReservedInr: number,
): number {
  const rem = Math.max(0, Number(remainingAfterListReserve) || 0);
  const held = Math.max(0, Number(listedReservedInr) || 0);
  return Math.round((rem + held) * 100) / 100;
}

/** Listed user WDs still hold unpaid principal in p2pPayUsed. Business-origin never holds. */
export function isListedQuotaHoldActive(w: {
  origin?: string | null;
  p2pListStatus?: string | null;
}): boolean {
  if (w.origin === 'business') return false;
  if (w.p2pListStatus && w.p2pListStatus !== 'listed') return false;
  return true;
}

/** Cancel/reject heal: already-terminal WD still listed still occupies quota. */
export function shouldHealCancelledListedQuota(opts: {
  status?: string | null;
  p2pListStatus?: string | null;
}): boolean {
  const status = (opts.status || '').toLowerCase();
  return (
    (status === 'cancelled' || status === 'rejected') &&
    opts.p2pListStatus === 'listed'
  );
}

/** Commission / fee rates always follow the WD owner — never the payer's business. */
export function withdrawalOwnerBusinessIdForRates(
  wdBusinessId?: string | null,
): string | undefined {
  const id = wdBusinessId != null ? String(wdBusinessId).trim() : '';
  return id || undefined;
}

export function p2pPayLimitExceededError(remaining: number): string {
  if (remaining < 1) {
    return 'No remaining P2P limit. Please contact admin to increase the limit. User deposits also increase remaining.';
  }
  return `Amount exceeds remaining P2P limit (₹${remaining})`;
}

/** Kept for call sites; quota is never unlimited. */
export function p2pPayQuotaIsUnlimited(
  _p2pPayLimit?: number | null,
  _p2pPayEarned?: number | null,
) {
  return false;
}
