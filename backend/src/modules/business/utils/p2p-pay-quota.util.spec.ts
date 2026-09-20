import {
  p2pPayQuotaCap,
  p2pPayQuotaIsUnlimited,
  p2pPayQuotaRemaining,
  p2pPayLimitExceededError,
  remainingForPayingListedWithdrawal,
  isListedQuotaHoldActive,
  shouldHealCancelledListedQuota,
  withdrawalOwnerBusinessIdForRates,
} from './p2p-pay-quota.util';

describe('p2pPayQuotaRemaining', () => {
  it('is ₹0 when seed and earned are 0 (never unlimited)', () => {
    expect(p2pPayQuotaRemaining({ p2pPayLimit: 0, p2pPayEarned: 0, p2pPayUsed: 0 })).toBe(0);
    expect(p2pPayQuotaIsUnlimited(0, 0)).toBe(false);
  });

  it('grows remaining when users deposit (earned)', () => {
    expect(
      p2pPayQuotaRemaining({ p2pPayLimit: 0, p2pPayEarned: 1000, p2pPayUsed: 0 }),
    ).toBe(1000);
    expect(
      p2pPayQuotaRemaining({ p2pPayLimit: 5000, p2pPayEarned: 1000, p2pPayUsed: 0 }),
    ).toBe(6000);
  });

  it('deducts remaining when withdrawals consume used', () => {
    expect(
      p2pPayQuotaRemaining({ p2pPayLimit: 0, p2pPayEarned: 1000, p2pPayUsed: 400 }),
    ).toBe(600);
    expect(
      p2pPayQuotaRemaining({ p2pPayLimit: 5000, p2pPayEarned: 1000, p2pPayUsed: 2000, hold: 500 }),
    ).toBe(3500);
  });

  it('never goes below 0', () => {
    expect(
      p2pPayQuotaRemaining({ p2pPayLimit: 100, p2pPayEarned: 0, p2pPayUsed: 250 }),
    ).toBe(0);
  });
});

describe('remainingForPayingListedWithdrawal', () => {
  it('adds back this WD list reserve so pay is not blocked after list', () => {
    expect(remainingForPayingListedWithdrawal(200, 10_000)).toBe(10_200);
    expect(remainingForPayingListedWithdrawal(0, 5_000)).toBe(5_000);
    expect(remainingForPayingListedWithdrawal(500, 0)).toBe(500);
  });
});

describe('p2pPayLimitExceededError', () => {
  it('tells users to contact admin when remaining is ₹0', () => {
    const msg = p2pPayLimitExceededError(0);
    expect(msg).toContain('contact admin');
    expect(msg).toContain('deposits');
  });

  it('shows remaining when amount is over the cap', () => {
    expect(p2pPayLimitExceededError(250)).toBe('Amount exceeds remaining P2P limit (₹250)');
  });
});

describe('listed quota hold / cancel heal / WD owner rates', () => {
  it('holds quota only for listed non-business WDs', () => {
    expect(isListedQuotaHoldActive({ p2pListStatus: 'listed' })).toBe(true);
    expect(isListedQuotaHoldActive({ origin: 'business', p2pListStatus: 'listed' })).toBe(
      false,
    );
  });

  it('heals cancelled WDs that are still listed', () => {
    expect(
      shouldHealCancelledListedQuota({ status: 'cancelled', p2pListStatus: 'listed' }),
    ).toBe(true);
    expect(
      shouldHealCancelledListedQuota({ status: 'pending', p2pListStatus: 'listed' }),
    ).toBe(false);
  });

  it('never uses payer business as WD-owner for rates', () => {
    expect(withdrawalOwnerBusinessIdForRates('biz-1')).toBe('biz-1');
    expect(withdrawalOwnerBusinessIdForRates(undefined)).toBeUndefined();
  });
});

describe('p2pPayQuotaCap', () => {
  it('adds admin seed and deposit-earned', () => {
    expect(p2pPayQuotaCap(1000, 250)).toBe(1250);
    expect(p2pPayQuotaCap(0, 250)).toBe(250);
    expect(p2pPayQuotaCap(-1, 250)).toBe(250);
  });
});
