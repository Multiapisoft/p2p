/**
 * Investor bonus (INVESTOR_BONUS) is always visible to the investor.
 * Platform/business fee cuts stay hidden separately — this is not a fee split.
 */
export function visibleInvestorBonusAmount(opts: {
  viewerRole?: string | null;
  /** @deprecated Ignored — investors always see their bonus amount. */
  showToInvestor?: boolean;
  bonusAmount: number;
}): number {
  return Math.max(0, Number(opts.bonusAmount) || 0);
}
