'use client';

import { Suspense } from 'react';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { LoadingScreen } from '@/shared/components/ui/State';

export default function SettingsRoute() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SettingsPage />
    </Suspense>
  );
}
