import { Suspense } from 'react';
import { IntegrationPage } from '@/features/integration/pages/IntegrationPage';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <IntegrationPage />
    </Suspense>
  );
}
