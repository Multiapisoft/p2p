import {
  disputedKeepsListQuotaLocked,
  pendingHoldsWdSlot,
  shouldFreeReservedOnDispute,
} from './dispute-quota-hold.util';
import { applyListWithdrawal, bizRemaining, type BizQuotaState } from './p2p-settlement-math.util';

describe('dispute keeps WD pay-limit locked', () => {
  it('does not free reservedAmount when dispute is raised', () => {
    expect(shouldFreeReservedOnDispute()).toBe(false);
  });

  it('pending disputed payment still holds the WD slot', () => {
    expect(pendingHoldsWdSlot({ status: 'pending', disputedAt: new Date() })).toBe(true);
    expect(pendingHoldsWdSlot({ status: 'completed', disputedAt: new Date() })).toBe(false);
  });

  it('scenario: 50k listed WD, 20k disputed pay — remaining stays locked until resolve', () => {
    let quota: BizQuotaState = { limit: 100_000, earned: 0, used: 0 };
    quota = applyListWithdrawal(quota, 50_000);
    expect(bizRemaining(quota)).toBe(50_000);

    const wd = {
      amount: 50_000,
      paidAmount: 0,
      reservedAmount: 20_000, // 20k pay submitted
    };
    // Dispute: keep reserved (do not free)
    expect(shouldFreeReservedOnDispute()).toBe(false);
    const afterDisputeReserved = wd.reservedAmount;
    expect(afterDisputeReserved).toBe(20_000);

    const open = Math.max(0, wd.amount - wd.paidAmount - afterDisputeReserved);
    expect(open).toBe(30_000); // others can only pay the remaining 30k, not the disputed 20k

    expect(
      disputedKeepsListQuotaLocked({
        listed: true,
        unpaidPrincipalInr: wd.amount - wd.paidAmount,
        disputedPendingInr: 20_000,
      }),
    ).toBe(true);

    // List quota unused principal still in used — limit not unblocked
    expect(bizRemaining(quota)).toBe(50_000);
  });

  it('after dispute reject of 20k, reserved frees but unpaid list quota stays until unlist/other pays', () => {
    let quota: BizQuotaState = { limit: 100_000, earned: 0, used: 50_000 };
    const wd = { amount: 50_000, paidAmount: 0, reservedAmount: 20_000 };
    // reject disputed pay → free reserved only
    wd.reservedAmount = Math.max(0, wd.reservedAmount - 20_000);
    expect(wd.reservedAmount).toBe(0);
    expect(bizRemaining(quota)).toBe(50_000); // still locked via list used
    expect(
      disputedKeepsListQuotaLocked({
        listed: true,
        unpaidPrincipalInr: 50_000,
        disputedPendingInr: 0,
      }),
    ).toBe(true);
  });
});
