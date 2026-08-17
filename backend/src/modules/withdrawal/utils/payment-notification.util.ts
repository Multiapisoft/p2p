/**
 * Notification copy when a payer submits proof toward a withdrawal (#12).
 */
export function paymentReceivedNotification(opts: {
  payAmount: number;
  paidAmount: number;
  reservedAmount: number;
  withdrawalAmount: number;
  referenceId: string;
}): { title: string; body: string } {
  const covered = (opts.paidAmount || 0) + (opts.reservedAmount || 0);
  const isFullCover = covered >= opts.withdrawalAmount;
  if (isFullCover) {
    return {
      title: 'Full Payment Received',
      body: `Full payment of ₹${opts.payAmount} was submitted for your withdrawal ${opts.referenceId}. Confirm once you receive it.`,
    };
  }
  return {
    title: 'Partial Payment Received',
    body: `Someone submitted ₹${opts.payAmount} toward your withdrawal ${opts.referenceId}`,
  };
}

/**
 * Investor bonus is credited only after plan target is met (#26).
 */
export function shouldCreditInvestorBonus(opts: {
  planAmount: number | null | undefined;
  multiplier: number;
  paidTowardPlan: number;
  thisPaymentPrincipal: number;
}): boolean {
  const plan = opts.planAmount || 0;
  if (plan <= 0) return false;
  const target = Math.round(plan * opts.multiplier * 100) / 100;
  return opts.paidTowardPlan + opts.thisPaymentPrincipal >= target;
}
