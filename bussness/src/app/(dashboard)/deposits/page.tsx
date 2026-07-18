import { Suspense } from 'react';
import { DepositsPage } from '@/features/deposits/pages/DepositsPage';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DepositsPage />
    </Suspense>
  );
}
