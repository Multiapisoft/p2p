import {
  listApprovalHeadroomError,
  listApprovalHeadroomNeeded,
  overLimitListDecision,
} from './list-approval-fee-headroom.util';

/**
 * Product rule: before admin/business lists a new WD for P2P, remaining limit must cover
 * new open principal + fees on currently listed opens + fee for the new WD.
 */
describe('list approval fee headroom — complex approve scenarios', () => {
  const feePercent = 5; // 5% WD fee
  const feeOf = (open: number) => Math.round(((open * feePercent) / 100) * 100) / 100;

  function canApprove(opts: {
    remaining: number;
    newOpenInr: number;
    existingListedOpens: number[];
  }) {
    const existingFees = opts.existingListedOpens.reduce((s, o) => s + feeOf(o), 0);
    const newFee = feeOf(opts.newOpenInr);
    const needed = listApprovalHeadroomNeeded({
      newOpenInr: opts.newOpenInr,
      newWithdrawalFee: newFee,
      existingListedOpenFees: existingFees,
    });
    return {
      needed,
      newFee,
      existingFees,
      feesTotal: Math.round((existingFees + newFee) * 100) / 100,
      allowed: needed <= opts.remaining,
      error: listApprovalHeadroomError({
        needed,
        remaining: opts.remaining,
        newOpenInr: opts.newOpenInr,
        feesTotal: Math.round((existingFees + newFee) * 100) / 100,
      }),
    };
  }

  it('blocks approve when remaining only covers new open but not fees', () => {
    // Remaining 10_000, new WD 10_000, fee 5% = 500 → need 10_500
    const r = canApprove({
      remaining: 10_000,
      newOpenInr: 10_000,
      existingListedOpens: [],
    });
    expect(r.needed).toBe(10_500);
    expect(r.allowed).toBe(false);
    expect(r.error).toContain('Cannot approve');
    expect(r.error).toContain('₹10500');
    expect(r.error).toContain('₹10000');
  });

  it('allows approve when remaining covers open + new fee with no prior listed', () => {
    const r = canApprove({
      remaining: 10_500,
      newOpenInr: 10_000,
      existingListedOpens: [],
    });
    expect(r.needed).toBe(10_500);
    expect(r.allowed).toBe(true);
  });

  it('includes fees for multiple already-listed opens before new approve', () => {
    // Listed opens: 20k + 15k → fees 1000 + 750 = 1750
    // New open 5k → fee 250
    // Need 5000 + 1750 + 250 = 7000
    const r = canApprove({
      remaining: 6_999,
      newOpenInr: 5_000,
      existingListedOpens: [20_000, 15_000],
    });
    expect(r.existingFees).toBe(1_750);
    expect(r.newFee).toBe(250);
    expect(r.needed).toBe(7_000);
    expect(r.allowed).toBe(false);

    const ok = canApprove({
      remaining: 7_000,
      newOpenInr: 5_000,
      existingListedOpens: [20_000, 15_000],
    });
    expect(ok.allowed).toBe(true);
  });

  it('rounds money to paise (2 decimals) consistently', () => {
    // 333.33 * 5% = 16.6665 → roundMoney 16.67
    const open = 333.33;
    const fee = feeOf(open);
    const needed = listApprovalHeadroomNeeded({
      newOpenInr: open,
      newWithdrawalFee: fee,
      existingListedOpenFees: 0.005, // rounds via Math.max + roundMoney path
    });
    expect(needed).toBe(Math.round((open + fee + 0.005) * 100) / 100);
  });

  it('zero / empty opens need only new fee headroom', () => {
    const r = canApprove({
      remaining: 100,
      newOpenInr: 0,
      existingListedOpens: [0, 0],
    });
    expect(r.needed).toBe(0);
    expect(r.allowed).toBe(true);
  });

  it('admin and business both blocked when over remaining pay limit', () => {
    expect(
      overLimitListDecision({ needed: 11_000, remaining: 10_000, isAdmin: false }),
    ).toBe('block');
    expect(
      overLimitListDecision({ needed: 11_000, remaining: 10_000, isAdmin: true }),
    ).toBe('block');
    expect(
      overLimitListDecision({ needed: 9_000, remaining: 10_000, isAdmin: false }),
    ).toBe('list');
  });

  it('error message surfaces fee total for ops debugging', () => {
    const r = canApprove({
      remaining: 1,
      newOpenInr: 1_000,
      existingListedOpens: [2_000],
    });
    expect(r.feesTotal).toBe(feeOf(1000) + feeOf(2000));
    expect(r.error).toContain(`fees ₹${r.feesTotal}`);
    expect(r.error).toContain('Remaining ₹1');
  });
});
