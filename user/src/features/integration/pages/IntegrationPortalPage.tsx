'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { integrationApi } from '../api/integration.api';
import { setPasswordApi } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { toast } from '@/shared/ui/toast/toast.store';
import type { AuthUser } from '@/shared/types/api.types';

function IntegrationPortalInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Missing integration token');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const s = await integrationApi.getSession(token);
        if (cancelled) return;
        if (s.type !== 'portal') {
          throw new Error(`Invalid session type: ${s.type}`);
        }

        // Always auto-login via redirect claim
        const claim = await integrationApi.claim(token);
        if (cancelled) return;

        const user = claim.user as AuthUser;
        setAuth(claim.accessToken, user);
        setEmail(user.email);

        if (user.mustSetPassword || claim.session?.isNewUser) {
          setNeedsPassword(true);
          return;
        }

        router.replace('/');
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : err instanceof Error
              ? err.message
              : 'Failed to open P2P portal';
        setError(msg || 'Invalid or expired link');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, setAuth, router]);

  const savePassword = async () => {
    setFormError('');
    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await setPasswordApi(newPassword);
      setAuth(res.accessToken, res.user);
      toast.success('Password saved', 'You are signed in');
      router.replace('/');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to set password';
      setFormError(msg || 'Failed to set password');
      toast.error('Could not save password', msg || undefined);
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
        <div className="max-w-md rounded-xl border border-error-container bg-error-container/30 p-4 text-center sm:p-6">
          <p className="font-semibold text-on-error-container">{error}</p>
          <Button className="mt-4 w-full sm:w-auto" variant="secondary" onClick={() => router.replace('/login')}>
            Go to login
          </Button>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm sm:p-6">
          <h1 className="font-[family-name:var(--font-headline)] text-lg font-bold text-on-background sm:text-xl">
            Set your password
          </h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            You are signed in. Set a password so you can log in next time with this email.
          </p>

          <div className="mt-5 rounded-xl bg-surface-container p-4">
            <p className="text-xs text-on-surface-variant">Email</p>
            <p className="mt-0.5 break-all font-medium text-on-background">{email}</p>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void savePassword();
            }}
          >
            <Input
              label="New password"
              icon="lock"
              type={showPass ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
            <Input
              label="Confirm password"
              icon="lock"
              type={showPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              minLength={8}
            />
            <button
              type="button"
              className="text-xs text-secondary hover:underline"
              onClick={() => setShowPass(!showPass)}
            >
              {showPass ? 'Hide' : 'Show'} password
            </button>

            {formError ? (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {formError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" loading={saving}>
                Save &amp; continue
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={saving}
                onClick={() => router.replace('/')}
              >
                Skip for now
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
      <LoadingScreen />
      <p className="text-sm text-on-surface-variant">
        {email ? (
          <>
            Signing in as <span className="font-medium text-on-background">{email}</span>…
          </>
        ) : (
          'Opening your P2P wallet…'
        )}
      </p>
    </div>
  );
}

export function IntegrationPortalPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <IntegrationPortalInner />
    </Suspense>
  );
}
