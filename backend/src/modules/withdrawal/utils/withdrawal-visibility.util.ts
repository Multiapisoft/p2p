/**
 * Visibility rules:
 * - During user cancel TAT → owner can cancel; business/admin can already *see*
 *   the request but Approve / Assign stay blocked until TAT ends.
 * - After TAT → business / admin can list for Platform Payment
 * - After listed (p2pListStatus=listed) → investors/users for pay
 */

export function tatCutoffDate(nowMs: number, tatMs: number): Date {
  return new Date(nowMs - tatMs);
}

export function isWithinUserEditTat(
  createdAt: Date | string | undefined,
  nowMs: number,
  tatMs: number,
): boolean {
  if (!createdAt) return false;
  return nowMs - new Date(createdAt).getTime() < tatMs;
}

export function remainingTatSeconds(
  createdAt: Date | string | undefined,
  nowMs: number,
  tatMs: number,
): number {
  if (!createdAt) return 0;
  const elapsed = nowMs - new Date(createdAt).getTime();
  if (elapsed >= tatMs) return 0;
  return Math.ceil((tatMs - elapsed) / 1000);
}

/**
 * Business/admin list: show all scoped withdrawals immediately.
 * Approve still enforces TAT in listForP2p / assign.
 * Returns `{}` (no extra constraint) so callers can safely put it in `$and`.
 */
export function postTatWithdrawalVisibilityFilter(_tatCutoff: Date): Record<string, never> {
  return {};
}

export function businessWithdrawalVisibilityFilter(tatCutoff: Date) {
  return postTatWithdrawalVisibilityFilter(tatCutoff);
}

/** Admin oversight list uses the same visibility as business. */
export function adminWithdrawalVisibilityFilter(tatCutoff: Date) {
  return postTatWithdrawalVisibilityFilter(tatCutoff);
}

/**
 * Investor/user pay list: only admin-listed P2P requests.
 * Business-origin WDs stay off the pay list until admin lists them.
 */
export function availableForPaymentBaseFilter(excludeUserId: unknown) {
  return {
    userId: { $ne: excludeUserId },
    status: { $in: ['pending', 'processing'] },
    p2pListStatus: 'listed' as const,
  };
}

/** Claim / pay: listed only — awaiting business WDs are not payable yet. */
export function isOpenOnPayList(w: {
  p2pListStatus?: string | null;
  status?: string;
}) {
  if (w.p2pListStatus !== 'listed') return false;
  if (w.status && w.status !== 'pending' && w.status !== 'processing') return false;
  return true;
}

/** Investors may pay user withdrawals only — never another investor. */
export function isInvestorToInvestorPay(
  payerRole?: string | null,
  ownerRole?: string | null,
) {
  return payerRole === 'investor' && ownerRole === 'investor';
}

export function userCanCancelWithdrawal(opts: {
  status: string;
  p2pListStatus?: string;
  paidAmount?: number;
  createdAt?: Date | string;
  nowMs: number;
  tatMs: number;
}): boolean {
  const cancellable =
    opts.status === 'pending' || opts.status === 'processing';
  const listed = opts.p2pListStatus === 'listed';
  const withinTat = isWithinUserEditTat(opts.createdAt, opts.nowMs, opts.tatMs);
  return cancellable && !listed && withinTat && (opts.paidAmount || 0) === 0;
}

/** Destination edit is disabled — owner may only cancel within TAT. */
export function userCanEditWithdrawal(
  _opts: Parameters<typeof userCanCancelWithdrawal>[0],
): boolean {
  return false;
}
