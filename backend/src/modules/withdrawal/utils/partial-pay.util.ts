/** Minimum partial pay (INR). Full remaining can be less. */
export const MIN_PARTIAL_INR = 5000;
/** Minimum partial pay (USDT). */
export const MIN_PARTIAL_USDT = 5;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function minPartialAmount(
  method?: string,
  currency?: string,
  overrideMin?: number,
): number {
  const usdt =
    method === 'usdt' || (currency || '').toUpperCase() === 'USDT';
  if (usdt) return MIN_PARTIAL_USDT;
  if (typeof overrideMin === 'number' && overrideMin > 0) return overrideMin;
  return MIN_PARTIAL_INR;
}

/** When investor plan quota left is below min partial, allow tail pays up to this amount. */
export function investorTailRemaining(
  limitRemaining: number | null | undefined,
  method?: string,
  currency?: string,
  minPartial?: number,
): number | undefined {
  if (limitRemaining == null || limitRemaining <= 0) return undefined;
  const min = minPartialAmount(method, currency, minPartial);
  if (limitRemaining >= min) return undefined;
  return roundMoney(limitRemaining);
}

/**
 * Partial pay must be >= min (₹5,000 / 5 USDT) and must not leave leftover
 * below that min. Paying the full remaining is always allowed.
 * Cap exception: if amount already hits maxPayable, leftover-under-min is ok.
 * When allowPartial is false, only full remaining is accepted (Noida #53).
 */
export function partialPayError(opts: {
  amount: number;
  remaining: number;
  maxPayable?: number;
  method?: string;
  currency?: string;
  allowPartial?: boolean;
  minPartial?: number;
  /** Investor plan tail: remaining quota below min partial — allow paying up to this. */
  investorTailRemaining?: number;
}): string | null {
  const amount = roundMoney(opts.amount);
  const remaining = roundMoney(opts.remaining);
  const maxPayable = roundMoney(opts.maxPayable ?? remaining);
  const min = minPartialAmount(opts.method, opts.currency, opts.minPartial);
  const tail = roundMoney(opts.investorTailRemaining ?? 0);

  if (!(amount > 0)) return 'Enter a valid amount';
  if (amount > remaining) return `Amount exceeds remaining ${remaining}`;
  if (amount > maxPayable) return `Amount exceeds max payable ${maxPayable}`;

  if (amount >= remaining) return null;

  if (opts.allowPartial === false) {
    if (tail > 0 && amount <= tail) return null;
    return `Partial pay is disabled. Pay full remaining (${remaining}).`;
  }

  const leftover = roundMoney(remaining - amount);
  const atCap = amount >= maxPayable;
  if (amount < min && !atCap) {
    return `Partial pay minimum is ${min}. Pay full remaining (${remaining}) or at least ${min}.`;
  }
  if (leftover > 0 && leftover < min && !atCap) {
    return `Partial cannot leave less than ${min} open. Pay full ${remaining}, or leave at least ${min}.`;
  }
  return null;
}

/** Budget X matches a WD if it can fully close it, or take X as a valid partial. */
export function canMatchPayBudget(
  remaining: number,
  budget: number,
  method?: string,
  currency?: string,
  minPartial?: number,
  investorTailRemaining?: number,
): boolean {
  const rem = roundMoney(remaining);
  const x = roundMoney(budget);
  if (rem <= x) return true;
  const tail = roundMoney(investorTailRemaining ?? 0);
  if (tail > 0 && tail < minPartialAmount(method, currency, minPartial) && x <= tail) {
    return rem >= x;
  }
  const min = minPartialAmount(method, currency, minPartial);
  return x >= min && rem >= roundMoney(x + min);
}
