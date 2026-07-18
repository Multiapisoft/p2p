'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { AppLayout } from '@/shared/components/layout/AppLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const isAuth = !!token;
  const isBusiness = user?.role === 'business';

  useEffect(() => {
    if (!isAuth || !isBusiness) {
      router.replace('/login');
    }
  }, [isAuth, isBusiness, router]);

  if (!isAuth || !isBusiness) {
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}
