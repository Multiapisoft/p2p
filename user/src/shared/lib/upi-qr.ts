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

export function buildUpiAppLinks(opts: {
  upiId: string;
  name?: string;
  amount?: number;
}): { id: string; label: string; href: string }[] {
  const qs = buildUpiPayUri(opts).replace(/^upi:\/\/pay\?/, '');
  return [
    { id: 'phonepe', label: 'PhonePe', href: `phonepe://pay?${qs}` },
    { id: 'gpay', label: 'GPay', href: `tez://upi/pay?${qs}` },
    { id: 'paytm', label: 'Paytm', href: `paytmmp://pay?${qs}` },
  ];
}

export function formatSecondsMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}
