'use client';

import { FulfillWithdrawals } from '@/features/fulfill/components/FulfillWithdrawals';

export function FulfillPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold">Fulfill & Earn</h1>
        <p className="text-on-surface-variant">
          Pay user withdrawals (UPI/QR, Bank, USDT). Once approved, equal points are credited to your
          wallet.
        </p>
      </div>
      <FulfillWithdrawals />
    </div>
  );
}
