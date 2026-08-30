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
 * Investor bonus is credited on every approved investor pay (business INVESTOR_BONUS %).
 * Plan-target gating was removed — pay amount + bonus always apply when a rate is set.
 */
export function shouldCreditInvestorBonus(_opts: {
  planAmount: number | null | undefined;
  multiplier: number;
  paidTowardPlan: number;
  thisPaymentPrincipal: number;
}): boolean {
  return true;
}
