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

export function p2pPayLimitExceededError(remaining: number): string {
  if (remaining < 1) {
    return 'No remaining P2P limit. User deposits increase remaining; withdrawals must stay within the limit.';
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
