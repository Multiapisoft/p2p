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
  const isAdmin = user?.role === 'admin' || user?.role === 'sub_admin';

  useEffect(() => {
    if (!isAuth || !isAdmin) {
      router.replace('/login');
    }
  }, [isAuth, isAdmin, router]);

  if (!isAuth || !isAdmin) {
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}
