import { userDepositMatchesOpen } from './user-deposit-match.util';

describe('userDepositMatchesOpen', () => {
  const minInr = 5000;
  const minUsdtInr = 5 * 90; // 450

  it('hides large USDT opens when INR budget is too small for full or partial', () => {
    // Old bug: raw 22 USDT <= ₹500 matched. INR value ₹2000 must not.
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 100,
        openInr: 2000,
        isUsdt: true,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(false);
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 500,
        openInr: 275,
        isUsdt: true,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(true);
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 500,
        openInr: 3120,
        isUsdt: false,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(false);
  });

  it('shows UPI/Bank when budget covers full open', () => {
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 4000,
        openInr: 4000,
        isUsdt: false,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(true);
  });

  it('allows INR partial only from ₹5000 budget with leftover room', () => {
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 5000,
        openInr: 12_000,
        isUsdt: false,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(true);
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 5000,
        openInr: 8000,
        isUsdt: false,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(false);
  });
});
