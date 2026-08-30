import { Suspense } from 'react';
import { MyWithdrawalsPage } from '@/features/withdrawals/pages/MyWithdrawalsPage';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MyWithdrawalsPage />
    </Suspense>
  );
}
