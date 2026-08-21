import {
  addInvestorLimitLot,
  consumeInvestorLimitLifo,
  investorLimitLotsLifo,
  investorLimitRemaining,
  restoreInvestorLimitLifo,
} from './investor-limit-lifo.util';

describe('investor-limit-lifo', () => {
  const t1 = new Date('2026-01-01T00:00:00.000Z');
  const t2 = new Date('2026-01-02T00:00:00.000Z');
  const t3 = new Date('2026-01-03T00:00:00.000Z');

  it('adds lots and reports remaining', () => {
    let lots = addInvestorLimitLot([], 10000, t1);
    lots = addInvestorLimitLot(lots, 5000, t2);
    expect(investorLimitRemaining(lots)).toBe(15000);
    expect(investorLimitLotsLifo(lots).map((l) => l.amount)).toEqual([5000, 10000]);
  });

  it('consumes newest lot first (LIFO)', () => {
    let lots = addInvestorLimitLot([], 10000, t1);
    lots = addInvestorLimitLot(lots, 5000, t2);
    const out = consumeInvestorLimitLifo(lots, 6000);
    expect(out.shortfall).toBe(0);
    expect(out.consumed).toBe(6000);
    expect(investorLimitRemaining(out.lots)).toBe(9000);
    const lifo = investorLimitLotsLifo(out.lots);
    expect(lifo[0].remaining).toBe(0);
    expect(lifo[1].remaining).toBe(9000);
  });

  it('consumes across three lots newest-first', () => {
    let lots = addInvestorLimitLot([], 1000, t1);
    lots = addInvestorLimitLot(lots, 2000, t2);
    lots = addInvestorLimitLot(lots, 4000, t3);
    const out = consumeInvestorLimitLifo(lots, 5000);
    expect(out.shortfall).toBe(0);
    expect(out.consumed).toBe(5000);
    const lifo = investorLimitLotsLifo(out.lots);
    expect(lifo.map((l) => l.remaining)).toEqual([0, 1000, 1000]);
  });

  it('needsLimit is remaining <= 0 (amount-first, not preset plans)', () => {
    const empty = addInvestorLimitLot([], 0, t1);
    expect(investorLimitRemaining(empty)).toBe(0);
    const withAmount = addInvestorLimitLot([], 25000, t1);
    expect(investorLimitRemaining(withAmount)).toBe(25000);
  });

  it('returns shortfall when not enough remaining', () => {
    const lots = addInvestorLimitLot([], 1000, t1);
    const out = consumeInvestorLimitLifo(lots, 1500);
    expect(out.consumed).toBe(1000);
    expect(out.shortfall).toBe(500);
    expect(investorLimitRemaining(out.lots)).toBe(0);
  });

  it('restores onto newest consumed lot first', () => {
    let lots = addInvestorLimitLot([], 10000, t1);
    lots = addInvestorLimitLot(lots, 5000, t2);
    lots = consumeInvestorLimitLifo(lots, 6000).lots;
    lots = restoreInvestorLimitLifo(lots, 6000, t3);
    expect(investorLimitRemaining(lots)).toBe(15000);
    const lifo = investorLimitLotsLifo(lots);
    expect(lifo[0].remaining).toBe(5000);
    expect(lifo[1].remaining).toBe(10000);
  });
});
