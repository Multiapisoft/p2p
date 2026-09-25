/** Percent of principal for investor→investor referral rewards. */
export function referralRewardAmount(principal: number, percent: number): number {
  const p = Math.max(0, Number(principal) || 0);
  const pct = Math.max(0, Number(percent) || 0);
  if (p <= 0 || pct <= 0) return 0;
  return Math.round(((p * pct) / 100) * 100) / 100;
}

export function referralPercentsForPay(opts: {
  priorCompletedPays: number;
  firstReferrerPercent: number;
  firstJoinerPercent: number;
  nextReferrerPercent: number;
  nextJoinerPercent: number;
}): { referrerPercent: number; joinerPercent: number; isFirst: boolean } {
  const isFirst = (opts.priorCompletedPays || 0) <= 0;
  if (isFirst) {
    return {
      isFirst: true,
      referrerPercent: Math.max(0, Number(opts.firstReferrerPercent) || 0),
      joinerPercent: Math.max(0, Number(opts.firstJoinerPercent) || 0),
    };
  }
  return {
    isFirst: false,
    referrerPercent: Math.max(0, Number(opts.nextReferrerPercent) || 0),
    joinerPercent: Math.max(0, Number(opts.nextJoinerPercent) || 0),
  };
}

/** Inclusive calendar range: from 00:00:00.000 local to 23:59:59.999 local of toDate. */
export function isWithinReferralBonusPeriod(
  now: Date,
  fromDate?: Date | string | null,
  toDate?: Date | string | null,
): boolean {
  if (!fromDate || !toDate) return false;
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return false;
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (from.getTime() > to.getTime()) return false;
  const t = now.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/**
 * Prefer period percents when `now` falls in [fromDate, toDate]; otherwise default percents.
 * First vs next pay still applies inside the period.
 */
export function resolveReferralPercents(opts: {
  priorCompletedPays: number;
  now?: Date;
  firstReferrerPercent: number;
  firstJoinerPercent: number;
  nextReferrerPercent: number;
  nextJoinerPercent: number;
  periodFromDate?: Date | string | null;
  periodToDate?: Date | string | null;
  periodFirstReferrerPercent?: number | null;
  periodFirstJoinerPercent?: number | null;
  periodNextReferrerPercent?: number | null;
  periodNextJoinerPercent?: number | null;
}): { referrerPercent: number; joinerPercent: number; isFirst: boolean; inPeriod: boolean } {
  const inPeriod = isWithinReferralBonusPeriod(
    opts.now ?? new Date(),
    opts.periodFromDate,
    opts.periodToDate,
  );
  const base = inPeriod
    ? {
        firstReferrerPercent:
          opts.periodFirstReferrerPercent ?? opts.firstReferrerPercent,
        firstJoinerPercent: opts.periodFirstJoinerPercent ?? opts.firstJoinerPercent,
        nextReferrerPercent: opts.periodNextReferrerPercent ?? opts.nextReferrerPercent,
        nextJoinerPercent: opts.periodNextJoinerPercent ?? opts.nextJoinerPercent,
      }
    : {
        firstReferrerPercent: opts.firstReferrerPercent,
        firstJoinerPercent: opts.firstJoinerPercent,
        nextReferrerPercent: opts.nextReferrerPercent,
        nextJoinerPercent: opts.nextJoinerPercent,
      };
  return {
    ...referralPercentsForPay({
      priorCompletedPays: opts.priorCompletedPays,
      ...base,
    }),
    inPeriod,
  };
}
