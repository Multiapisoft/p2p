/** Minimum partial pay (INR). Full remaining can be less. */
export const MIN_PARTIAL_INR = 5000;
/** Minimum partial pay (USDT). */
export const MIN_PARTIAL_USDT = 5;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function minPartialAmount(method?: string, currency?: string): number {
  const usdt = method === 'usdt' || (currency || '').toUpperCase() === 'USDT';
  return usdt ? MIN_PARTIAL_USDT : MIN_PARTIAL_INR;
}

export function partialPayError(opts: {
  amount: number;
  remaining: number;
  maxPayable?: number;
  method?: string;
  currency?: string;
}): string | null {
  const amount = roundMoney(opts.amount);
  const remaining = roundMoney(opts.remaining);
  const maxPayable = roundMoney(opts.maxPayable ?? remaining);
  const min = minPartialAmount(opts.method, opts.currency);

  if (!(amount > 0)) return 'Enter a valid amount';
  if (amount > remaining) return `Amount exceeds remaining ${remaining}`;
  if (amount > maxPayable) return `Amount exceeds max payable ${maxPayable}`;

  if (amount >= remaining) return null;

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
