import {
  disputeResolveAction,
  requiresDisputeOutcome,
} from './dispute-resolve.util';

describe('dispute resolve outcome', () => {
  it('received → approve / verify; not_received → reject + unlock reserved', () => {
    expect(disputeResolveAction('received')).toEqual({
      paymentAction: 'approve',
      unlockWdReserved: false,
    });
    expect(disputeResolveAction('not_received')).toEqual({
      paymentAction: 'reject',
      unlockWdReserved: true,
    });
  });

  it('requires outcome only when resolving open disputed payment', () => {
    expect(
      requiresDisputeOutcome({
        nextStatus: 'resolved',
        isDispute: true,
        hasRelatedPayment: true,
        paymentStillDisputedPending: true,
      }),
    ).toBe(true);
    expect(
      requiresDisputeOutcome({
        nextStatus: 'resolved',
        isDispute: true,
        hasRelatedPayment: true,
        paymentStillDisputedPending: false,
      }),
    ).toBe(false);
    expect(
      requiresDisputeOutcome({
        nextStatus: 'in_progress',
        isDispute: true,
        hasRelatedPayment: true,
        paymentStillDisputedPending: true,
      }),
    ).toBe(false);
  });
});
