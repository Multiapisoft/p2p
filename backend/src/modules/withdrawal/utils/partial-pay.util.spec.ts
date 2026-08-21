import {
  canMatchPayBudget,
  MIN_PARTIAL_INR,
  partialPayError,
} from './partial-pay.util';

describe('partialPayError', () => {
  it('allows full remaining even when below ₹5,000', () => {
    expect(partialPayError({ amount: 2000, remaining: 2000 })).toBeNull();
  });

  it('blocks partial below ₹5,000', () => {
    expect(partialPayError({ amount: 2000, remaining: 20000 })).toMatch(
      /minimum is 5000/,
    );
  });

  it('allows ₹5,000+ partial when leftover is also ≥ ₹5,000', () => {
    expect(
      partialPayError({ amount: 5000, remaining: 12000 }),
    ).toBeNull();
  });

  it('blocks partial that would leave leftover under ₹5,000', () => {
    expect(partialPayError({ amount: 5000, remaining: 8000 })).toMatch(
      /leave less than 5000/,
    );
  });

  it('allows under-min bite when maxPayable cap is hit', () => {
    expect(
      partialPayError({
        amount: 4000,
        remaining: 12000,
        maxPayable: 4000,
      }),
    ).toBeNull();
  });
});

describe('canMatchPayBudget', () => {
  it('matches leftovers that can be fully paid', () => {
    expect(canMatchPayBudget(2000, 5000)).toBe(true);
    expect(canMatchPayBudget(5000, 5000)).toBe(true);
  });

  it('matches large WDs that can take ₹5,000+ partial without tiny leftover', () => {
    expect(canMatchPayBudget(12000, 5000)).toBe(true);
    expect(canMatchPayBudget(8000, 5000)).toBe(false);
    expect(canMatchPayBudget(20000, 2000)).toBe(false);
  });

  it('uses USDT min of 5', () => {
    expect(canMatchPayBudget(12, 5, 'usdt')).toBe(true);
    expect(canMatchPayBudget(8, 5, 'usdt')).toBe(false);
  });
});

describe('constants', () => {
  it('INR partial floor is 5000', () => {
    expect(MIN_PARTIAL_INR).toBe(5000);
  });
});
