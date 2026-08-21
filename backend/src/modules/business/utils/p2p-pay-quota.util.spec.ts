import {
  p2pPayQuotaCap,
  p2pPayQuotaIsUnlimited,
  p2pPayQuotaRemaining,
  p2pPayLimitExceededError,
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

describe('p2pPayLimitExceededError', () => {
  it('tells users to deposit when remaining is ₹0', () => {
    expect(p2pPayLimitExceededError(0)).toContain('User deposits increase remaining');
  });

  it('shows remaining when amount is over the cap', () => {
    expect(p2pPayLimitExceededError(250)).toBe('Amount exceeds remaining P2P limit (₹250)');
  });
});

describe('p2pPayQuotaCap', () => {
  it('adds admin seed and deposit-earned', () => {
    expect(p2pPayQuotaCap(1000, 250)).toBe(1250);
    expect(p2pPayQuotaCap(0, 250)).toBe(250);
    expect(p2pPayQuotaCap(-1, 250)).toBe(250);
  });
});
