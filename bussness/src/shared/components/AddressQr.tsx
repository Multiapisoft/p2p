'use client';

import { useState } from 'react';

interface AddressQrProps {
  value: string;
  label?: string;
  size?: number;
}

/** Renders a QR for a wallet/UPI/otpauth URI (no extra npm dependency). */
export function AddressQr({ value, label = 'Scan to pay', size = 168 }: AddressQrProps) {
  const [failed, setFailed] = useState(false);
  if (!value || failed) return null;

  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(value)}`;

  return (
    <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-outline-variant/60 bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        className="rounded-md"
        onError={() => setFailed(true)}
      />
      <p className="text-[11px] font-medium text-on-surface-variant">{label}</p>
    </div>
  );
}
