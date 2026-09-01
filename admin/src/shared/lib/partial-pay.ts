/** Platform default minimum partial pay (INR). */
export const MIN_PARTIAL_INR = 5000;
/** Platform default minimum partial pay (USDT). */
export const MIN_PARTIAL_USDT = 5;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function minPartialAmount(
  method?: string,
  currency?: string,
  overrideMin?: number,
): number {
  const usdt = method === 'usdt' || (currency || '').toUpperCase() === 'USDT';
  if (usdt) return MIN_PARTIAL_USDT;
  if (typeof overrideMin === 'number' && overrideMin > 0) return overrideMin;
  return MIN_PARTIAL_INR;
}

export function partialPayError(opts: {
  amount: number;
  remaining: number;
  maxPayable?: number;
  method?: string;
  currency?: string;
  allowPartial?: boolean;
  minPartial?: number;
}): string | null {
  const amount = roundMoney(opts.amount);
  const remaining = roundMoney(opts.remaining);
  const maxPayable = roundMoney(opts.maxPayable ?? remaining);
  const min = minPartialAmount(opts.method, opts.currency, opts.minPartial);

  if (!(amount > 0)) return 'Enter a valid amount';
  if (amount > remaining) return `Amount exceeds remaining ${remaining}`;
  if (amount > maxPayable) return `Amount exceeds max payable ${maxPayable}`;

  if (amount >= remaining) return null;

  if (opts.allowPartial === false) {
    return `Full pay only. Pay full remaining (${remaining}).`;
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
