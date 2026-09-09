import { Suspense } from 'react';
import { CdmRequestsPage } from '@/features/deposits/pages/CdmRequestsPage';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CdmRequestsPage />
    </Suspense>
  );
}
