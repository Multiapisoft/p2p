/** Minimum partial pay (INR). Full remaining can be less. */
export const MIN_PARTIAL_INR = 5000;
/** Minimum partial pay (USDT). */
export const MIN_PARTIAL_USDT = 5;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function minPartialAmount(method?: string, currency?: string): number {
  const usdt =
    method === 'usdt' || (currency || '').toUpperCase() === 'USDT';
  return usdt ? MIN_PARTIAL_USDT : MIN_PARTIAL_INR;
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
}): string | null {
  const amount = roundMoney(opts.amount);
  const remaining = roundMoney(opts.remaining);
  const maxPayable = roundMoney(opts.maxPayable ?? remaining);
  const min = minPartialAmount(opts.method, opts.currency);

  if (!(amount > 0)) return 'Enter a valid amount';
  if (amount > remaining) return `Amount exceeds remaining ${remaining}`;
  if (amount > maxPayable) return `Amount exceeds max payable ${maxPayable}`;

  if (amount >= remaining) return null;

  if (opts.allowPartial === false) {
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
): boolean {
  const rem = roundMoney(remaining);
  const x = roundMoney(budget);
  if (rem <= x) return true;
  const min = minPartialAmount(method, currency);
  return x >= min && rem >= roundMoney(x + min);
}
