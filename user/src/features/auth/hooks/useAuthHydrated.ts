'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/store/auth.store';

/**
 * Wait for zustand persist to load token from localStorage before auth redirects.
 * Must only touch `.persist` in useEffect — on SSR storage is unavailable so
 * zustand skips attaching the persist API entirely.
 */
export function useAuthHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persistApi = useAuthStore.persist;
    if (!persistApi) {
      setHydrated(true);
      return;
    }
    if (persistApi.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persistApi.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}

/** Internal path only — blocks open redirects and auth loops. */
export function safeAuthNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (
    path === '/login' ||
    path.startsWith('/login?') ||
    path === '/register' ||
    path.startsWith('/register?') ||
    path === '/forgot-password' ||
    path.startsWith('/forgot-password')
  ) {
    return fallback;
  }
  return path;
}
