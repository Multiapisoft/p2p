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

/** Parse UPI ID (+ optional name) from a QR payload / upi:// URI / plain VPA. */
export function parseUpiPayPayload(raw: string): { upiId?: string; payerName?: string } | null {
  const text = (raw || '').trim();
  if (!text) return null;

  if (/^[\w.\-]+@[\w.\-]+$/i.test(text) || /^\d{10}@[\w.\-]+$/i.test(text)) {
    return { upiId: text };
  }

  const paMatch = text.match(/[?&]pa=([^&]+)/i);
  if (paMatch?.[1]) {
    const pnMatch = text.match(/[?&]pn=([^&]+)/i);
    let upiId = '';
    let payerName: string | undefined;
    try {
      upiId = decodeURIComponent(paMatch[1].replace(/\+/g, ' ')).trim();
    } catch {
      upiId = paMatch[1].trim();
    }
    if (pnMatch?.[1]) {
      try {
        payerName = decodeURIComponent(pnMatch[1].replace(/\+/g, ' ')).trim();
      } catch {
        payerName = pnMatch[1].trim();
      }
    }
    if (upiId) return { upiId, payerName: payerName || undefined };
  }

  return null;
}

/** Decode QR image in the browser (BarcodeDetector when available, else jsQR). */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const BD = (
    window as unknown as {
      BarcodeDetector?: new (opts?: { formats?: string[] }) => {
        detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>>;
      };
    }
  ).BarcodeDetector;

  if (typeof BD === 'function') {
    try {
      const detector = new BD({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close?.();
      const value = codes.find((c) => c.rawValue)?.rawValue;
      if (value) return value;
    } catch {
      // fall through to jsQR
    }
  }

  const jsQR = (await import('jsqr')).default;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return code?.data ?? null;
}
