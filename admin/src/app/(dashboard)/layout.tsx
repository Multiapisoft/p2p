'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useAuthHydrated } from '@/features/auth/hooks/useAuthHydrated';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { permissionForPath } from '@/shared/constants/route-permissions';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { LoadingScreen } from '@/shared/components/ui/Icon';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { has, isAdmin } = usePermissions();

  const isAuth = !!token;
  const isAdminRole = user?.role === 'admin' || user?.role === 'sub_admin';

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuth || !isAdminRole) {
      const next = `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    const required = permissionForPath(pathname);
    if (required === undefined) return;
    if (!has(required)) {
      router.replace('/');
    }
  }, [hydrated, isAuth, isAdminRole, router, pathname, has]);

  if (!hydrated || !isAuth || !isAdminRole) {
    return <LoadingScreen />;
  }

  const required = permissionForPath(pathname);
  if (required !== undefined && !has(required) && !isAdmin) {
    return <LoadingScreen />;
  }

  return <AppLayout>{children}</AppLayout>;
}
