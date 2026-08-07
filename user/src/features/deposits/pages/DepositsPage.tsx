'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { AvailableWithdrawalsPanel } from '../components/AvailableWithdrawalsPanel';

function DepositsPageInner() {
  const searchParams = useSearchParams();
  const [preferredPayAmount, setPreferredPayAmount] = useState<number | undefined>();

  useEffect(() => {
    const amountParam = Number(searchParams.get('payAmount'));
    if (Number.isFinite(amountParam) && amountParam >= 1) {
      setPreferredPayAmount(amountParam);
    }
  }, [searchParams]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
          Deposits
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Open withdrawal requests — pay karke deposit complete karo
        </p>
      </div>

      <AvailableWithdrawalsPanel preferredAmount={preferredPayAmount} />
    </div>
  );
}

export function DepositsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DepositsPageInner />
    </Suspense>
  );
}
