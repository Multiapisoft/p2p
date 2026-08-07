/** Build a UPI intent URI suitable for QR encoding. */
export function buildUpiPayUri(opts: {
  upiId: string;
  name?: string;
  amount?: number;
}): string {
  const params = new URLSearchParams({
    pa: opts.upiId,
    pn: opts.name || 'Pay',
    cu: 'INR',
  });
  if (opts.amount != null && Number.isFinite(opts.amount) && opts.amount > 0) {
    params.set('am', String(opts.amount));
  }
  return `upi://pay?${params.toString()}`;
}

export function formatSecondsMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}
