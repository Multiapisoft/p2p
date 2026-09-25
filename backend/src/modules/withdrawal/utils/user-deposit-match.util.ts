/**
 * User deposit match amount is INR. Convert WD open to INR before comparing,
 * otherwise tiny USDT opens (e.g. 22) falsely match a ₹2000 budget and hide INR WDs.
 *
 * Users only see exact (≈) or higher opens — never smaller WDs than the entered amount.
 * Higher opens require enough leftover headroom for the min partial rule.
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
  if (m <= 0 || open <= 0) return false;
  // Exact (rounding tolerance)
  if (Math.abs(open - m) <= 0.05) return true;
  // Smaller than deposit — never show
  if (open < m) return false;
  // Higher: partial into larger WD only when leftover ≥ min partial
  if (opts.isUsdt) {
    const min = Math.max(0, Number(opts.minUsdtPartialInr) || 0);
    return m >= min && open >= m + min;
  }
  const min = Math.max(0, Number(opts.minPartialInr) || 0);
  return m >= min && open >= m + min;
}

export function isExactUserDepositMatch(matchAmountInr: number, openInr: number): boolean {
  const m = Math.max(0, Number(matchAmountInr) || 0);
  const open = Math.max(0, Number(openInr) || 0);
  return m > 0 && open > 0 && Math.abs(open - m) <= 0.05;
}

/**
 * Prefer exact open ≈ deposit; else closest higher open (smallest open ≥ deposit).
 * Items are assumed already filtered by userDepositMatchesOpen.
 */
export function pickBestUserDepositMatch<T>(
  items: T[],
  opts: { matchAmountInr: number; openInrOf: (item: T) => number },
): T | null {
  if (!items.length) return null;
  const m = Math.max(0, Number(opts.matchAmountInr) || 0);
  const exact = items.find((item) => isExactUserDepositMatch(m, opts.openInrOf(item)));
  if (exact) return exact;
  let best: T | null = null;
  let bestOpen = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const open = opts.openInrOf(item);
    if (open + 0.05 < m) continue;
    if (open < bestOpen) {
      bestOpen = open;
      best = item;
    }
  }
  return best;
}
