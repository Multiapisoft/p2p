'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { Button } from '@/shared/components/ui/Button';
import { AvailableWithdrawalsPanel } from '../components/AvailableWithdrawalsPanel';
import { CdmDepositForm } from '../components/CdmDepositForm';

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
            Deposits
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Enter an amount first — matching withdrawal requests will show after that
          </p>
        </div>
        <Link href="/my-deposits">
          <Button size="sm" variant="secondary">
            My deposit history
          </Button>
        </Link>
      </div>

      <AvailableWithdrawalsPanel preferredAmount={preferredPayAmount} />
      <CdmDepositForm />
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
