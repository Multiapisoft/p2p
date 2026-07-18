'use client';

import { useAuthStore } from '@/features/auth/store/auth.store';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const has = (permission: string | null) => {
    if (!permission) return true;
    if (isAdmin) return true;
    return user?.permissions?.includes(permission) ?? false;
  };

  return { isAdmin, has, permissions: user?.permissions ?? [] };
}
