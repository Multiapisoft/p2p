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
  const isUser = user?.role === 'user';

  useEffect(() => {
    if (!isAuth || !isUser) {
      router.replace('/login');
    }
  }, [isAuth, isUser, router]);

  if (!isAuth || !isUser) {
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}
