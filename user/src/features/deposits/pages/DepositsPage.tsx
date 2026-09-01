'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { Button } from '@/shared/components/ui/Button';
import { AvailableWithdrawalsPanel } from '../components/AvailableWithdrawalsPanel';
import { CdmDepositForm } from '../components/CdmDepositForm';
import { profileApi } from '@/features/profile/api/profile.api';
import {
  isDepositMethodEnabled,
  resolveUserDepositMethods,
} from '@/shared/lib/payment-methods';

function DepositsPageInner() {
  const searchParams = useSearchParams();
  const [preferredPayAmount, setPreferredPayAmount] = useState<number | undefined>();

  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: () => profileApi.getMe(),
  });

  const allowedDepositMethods = useMemo(
    () => resolveUserDepositMethods(profile?.referredBusiness?.allowedDepositMethods),
    [profile?.referredBusiness?.allowedDepositMethods],
  );

  const showCdm = isDepositMethodEnabled('cdm', allowedDepositMethods);

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
        </div>
        <Link href="/my-deposits">
          <Button size="sm" variant="secondary">
            My deposit history
          </Button>
        </Link>
      </div>

      <AvailableWithdrawalsPanel preferredAmount={preferredPayAmount} />
      {showCdm ? <CdmDepositForm /> : null}
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
