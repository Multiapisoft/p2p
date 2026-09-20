'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useAuthHydrated } from '@/features/auth/hooks/useAuthHydrated';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const isAuth = !!token;
  const isInvestor = user?.role === 'investor';

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuth || !isInvestor) {
      const next = `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [hydrated, isAuth, isInvestor, router, pathname]);

  if (!hydrated || !isAuth || !isInvestor) {
    return <LoadingScreen />;
  }

  return <AppLayout>{children}</AppLayout>;
}
