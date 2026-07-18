import { Suspense } from 'react';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardPage />
    </Suspense>
  );
}
