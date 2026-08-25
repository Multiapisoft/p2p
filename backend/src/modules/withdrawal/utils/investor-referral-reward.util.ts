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
