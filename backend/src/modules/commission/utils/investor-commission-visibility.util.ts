/** Hide investor bonus on pay-list / UI when platform toggle is off. Credit still happens. */
export function visibleInvestorBonusAmount(opts: {
  viewerRole?: string | null;
  showToInvestor: boolean;
  bonusAmount: number;
}): number {
  const bonus = Math.max(0, Number(opts.bonusAmount) || 0);
  if (opts.viewerRole === 'investor' && !opts.showToInvestor) return 0;
  return bonus;
}
