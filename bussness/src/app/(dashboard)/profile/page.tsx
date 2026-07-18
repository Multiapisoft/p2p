import { Suspense } from 'react';
import { ProfilePage } from '@/features/profile/pages/ProfilePage';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ProfilePage />
    </Suspense>
  );
}
