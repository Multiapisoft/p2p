import {
  isExactUserDepositMatch,
  pickBestUserDepositMatch,
  userDepositMatchesOpen,
} from './user-deposit-match.util';

describe('userDepositMatchesOpen', () => {
  const minInr = 5000;
  const minUsdtInr = 5 * 90; // 450

  it('hides opens smaller than the deposit amount', () => {
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 500,
        openInr: 275,
        isUsdt: true,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(false);
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 4000,
        openInr: 3500,
        isUsdt: false,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(false);
  });

  it('hides large USDT opens when INR budget is too small for full or partial', () => {
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
        openInr: 3120,
        isUsdt: false,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(false);
  });

  it('shows exact open = deposit', () => {
    expect(
      userDepositMatchesOpen({
        matchAmountInr: 4000,
        openInr: 4000,
        isUsdt: false,
        minPartialInr: minInr,
        minUsdtPartialInr: minUsdtInr,
      }),
    ).toBe(true);
    expect(isExactUserDepositMatch(4000, 4000.02)).toBe(true);
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

describe('pickBestUserDepositMatch', () => {
  it('prefers exact over closer higher', () => {
    const items = [
      { id: 'hi', open: 12_000 },
      { id: 'exact', open: 5000 },
      { id: 'hi2', open: 5500 },
    ];
    const picked = pickBestUserDepositMatch(items, {
      matchAmountInr: 5000,
      openInrOf: (i) => i.open,
    });
    expect(picked?.id).toBe('exact');
  });

  it('picks closest higher when no exact', () => {
    const items = [
      { id: 'far', open: 20_000 },
      { id: 'near', open: 12_000 },
      { id: 'mid', open: 15_000 },
    ];
    const picked = pickBestUserDepositMatch(items, {
      matchAmountInr: 5000,
      openInrOf: (i) => i.open,
    });
    expect(picked?.id).toBe('near');
  });
});
