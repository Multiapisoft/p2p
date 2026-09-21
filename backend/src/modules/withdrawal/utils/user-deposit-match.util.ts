/**
 * User deposit match amount is INR. Convert WD open to INR before comparing,
 * otherwise tiny USDT opens (e.g. 22) falsely match a ₹2000 budget and hide INR WDs.
 */
export function userDepositMatchesOpen(opts: {
  matchAmountInr: number;
  openInr: number;
  isUsdt: boolean;
  minPartialInr: number;
  minUsdtPartialInr: number;
}): boolean {
  const m = Math.max(0, Number(opts.matchAmountInr) || 0);
  const open = Math.max(0, Number(opts.openInr) || 0);
  if (open <= m) return true;
  if (opts.isUsdt) {
    const min = Math.max(0, Number(opts.minUsdtPartialInr) || 0);
    return m >= min && open >= m + min;
  }
  const min = Math.max(0, Number(opts.minPartialInr) || 0);
  return m >= min && open >= m + min;
}
