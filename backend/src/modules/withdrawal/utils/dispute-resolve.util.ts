/**
 * Dispute ticket resolve outcomes for admin UI / API.
 * received → approve/verify payment
 * not_received → reject/cancel deposit + free WD reserved slot
 */
export type DisputeResolveOutcome = 'received' | 'not_received';

export function disputeResolveAction(outcome: DisputeResolveOutcome): {
  paymentAction: 'approve' | 'reject';
  unlockWdReserved: boolean;
} {
  if (outcome === 'received') {
    return { paymentAction: 'approve', unlockWdReserved: false };
  }
  return { paymentAction: 'reject', unlockWdReserved: true };
}

export function requiresDisputeOutcome(opts: {
  nextStatus: string;
  isDispute: boolean;
  hasRelatedPayment: boolean;
  paymentStillDisputedPending: boolean;
}): boolean {
  const resolving = opts.nextStatus === 'resolved' || opts.nextStatus === 'closed';
  return (
    resolving &&
    opts.isDispute &&
    opts.hasRelatedPayment &&
    opts.paymentStillDisputedPending
  );
}
