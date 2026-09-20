/** Investor pay queue: never advertise more than business maxPayable. */
export function investorQueueShownMaxPayable(
  businessMaxPayable: number,
  requiredPay: number,
): number {
  const cap = Math.max(0, Number(businessMaxPayable) || 0);
  if (cap <= 0) return 0;
  const required = Math.max(0, Number(requiredPay) || 0);
  if (required <= 0) return cap;
  return Math.min(required, cap);
}

export function investorCanSeePayItem(maxPayable: number): boolean {
  return Math.max(0, Number(maxPayable) || 0) > 0;
}
