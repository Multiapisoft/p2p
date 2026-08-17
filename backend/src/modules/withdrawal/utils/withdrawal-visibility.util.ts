/**
 * Visibility rules (Noida #24):
 * - During user cancel TAT → only owner (user) sees the WD
 * - After TAT → owning business can see / list for Platform Payment
 * - After business lists (p2pListStatus=listed) → admin + investors/users for pay
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

/** Business list: only after TAT expired */
export function businessWithdrawalVisibilityFilter(tatCutoff: Date) {
  return { createdAt: { $lte: tatCutoff } };
}

/**
 * Admin list: listed for Platform Payment, OR terminal status,
 * OR non-business WD after TAT.
 */
export function adminWithdrawalVisibilityFilter(tatCutoff: Date) {
  return {
    $or: [
      { p2pListStatus: 'listed' },
      {
        status: {
          $in: ['completed', 'rejected', 'cancelled'],
        },
      },
      {
        $and: [
          {
            $or: [{ businessId: { $exists: false } }, { businessId: null }],
          },
          { createdAt: { $lte: tatCutoff } },
        ],
      },
    ],
  };
}

/** Investor/user pay list requires Platform Payment listed */
export function availableForPaymentBaseFilter(excludeUserId: unknown) {
  return {
    userId: { $ne: excludeUserId },
    status: { $in: ['pending', 'processing'] },
    p2pListStatus: 'listed',
  };
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

/** Same TAT window as cancel — destination edit only. */
export function userCanEditWithdrawal(
  opts: Parameters<typeof userCanCancelWithdrawal>[0],
): boolean {
  return userCanCancelWithdrawal(opts);
}
