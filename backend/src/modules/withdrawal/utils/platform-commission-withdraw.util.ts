/** Cap a platform-commission withdrawal to available admin wallet funds. */
export function platformCommissionWithdrawError(opts: {
  amount: number;
  available: number;
  minAmount: number;
  method?: string;
}): string | null {
  const amount = Math.round(Number(opts.amount) * 100) / 100;
  const available = Math.round(Number(opts.available) * 100) / 100;
  const min = Math.max(1, Number(opts.minAmount) || 1);
  const skipMin = opts.method === 'usdt';

  if (!Number.isFinite(amount) || amount < 1) return 'Enter a valid amount';
  if (!skipMin && amount < min) return `Minimum withdrawal is ₹${min}`;
  if (amount > available) {
    return `Amount exceeds platform commission available (₹${available})`;
  }
  return null;
}
