import { roundMoney } from './p2p-settlement-math.util';

/**
 * Headroom required before listing a WD for P2P:
 * new open principal (will be reserved now)
 * + WD fees still owed on already-listed open WDs
 * + WD fee for this new open amount
 */
export function listApprovalHeadroomNeeded(opts: {
  newOpenInr: number;
  newWithdrawalFee: number;
  existingListedOpenFees: number;
}): number {
  return roundMoney(
    Math.max(0, opts.newOpenInr) +
      Math.max(0, opts.newWithdrawalFee) +
      Math.max(0, opts.existingListedOpenFees),
  );
}

export function listApprovalHeadroomError(opts: {
  needed: number;
  remaining: number;
  newOpenInr: number;
  feesTotal: number;
}): string {
  return (
    `Cannot approve: need ₹${opts.needed} limit headroom ` +
    `(open ₹${opts.newOpenInr} + withdrawal fees ₹${opts.feesTotal} for currently listed opens and this request). ` +
    `Remaining ₹${opts.remaining}. Increase business pay limit or wait until open withdrawals settle.`
  );
}

/** Business over-quota list waits for admin; admin may list anyway. */
export function overLimitListDecision(opts: {
  needed: number;
  remaining: number;
  isAdmin: boolean;
}): 'list' | 'queue_admin' {
  if (opts.needed <= opts.remaining) return 'list';
  return opts.isAdmin ? 'list' : 'queue_admin';
}
