'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useAuthHydrated } from '@/features/auth/hooks/useAuthHydrated';
import type { AuthUser } from '@/shared/types/api.types';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchMe(token: string): Promise<AuthUser | null> {
  const base = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const res = await fetch(`${base}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    data?: { _id?: string; id?: string; email?: string; name?: string; role?: string };
  } | null;
  const me = json?.data;
  if (!me?.email || !me?.role) return null;
  return {
    id: me.id || me._id || '',
    email: me.email,
    name: me.name || '',
    role: me.role as AuthUser['role'],
    permissions: [],
  };
}

function ImpersonateInner({
  homePath,
  expectedRole,
}: {
  homePath: string;
  expectedRole?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useAuthHydrated();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hydrated) return;
    const token = searchParams.get('token')?.trim();
    if (!token) {
      setError('Missing login token');
      return;
    }

    let cancelled = false;
    (async () => {
      const me = await fetchMe(token);
      if (cancelled) return;
      if (!me) {
        const payload = decodeJwtPayload(token);
        if (!payload?.sub || !payload?.email || !payload?.role) {
          setError('Invalid login token');
          return;
        }
        if (expectedRole && String(payload.role) !== expectedRole) {
          setError(`This login is for ${expectedRole} accounts`);
          return;
        }
        setAuth(token, {
          id: String(payload.sub),
          email: String(payload.email),
          name: '',
          role: String(payload.role),
          permissions: [],
        } as AuthUser);
        router.replace(homePath);
        return;
      }
      if (expectedRole && me.role !== expectedRole) {
        setError(`This login is for ${expectedRole} accounts`);
        return;
      }
      setAuth(token, me);
      router.replace(homePath);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, searchParams, setAuth, router, homePath, expectedRole]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="rounded-xl border border-error-container bg-error-container px-4 py-3 text-sm text-on-error-container">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-on-surface-variant">
      Signing you in…
    </div>
  );
}

export function ImpersonatePage({
  homePath,
  expectedRole,
}: {
  homePath: string;
  expectedRole?: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-6 text-sm text-on-surface-variant">
          Signing you in…
        </div>
      }
    >
      <ImpersonateInner homePath={homePath} expectedRole={expectedRole} />
    </Suspense>
  );
}
