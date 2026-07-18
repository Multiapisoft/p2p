import { Suspense } from 'react';
import { WithdrawalsPage } from '@/features/withdrawals/pages/WithdrawalsPage';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <WithdrawalsPage />
    </Suspense>
  );
}
