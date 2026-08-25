'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { loginApi } from '@/features/auth/api/auth.api';
import { useAuthHydrated } from '@/features/auth/hooks/useAuthHydrated';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { emailError, normalizeEmail } from '@/shared/lib/validation';

export function LoginPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (hydrated && token) router.replace('/home');
  }, [hydrated, token, router]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');

  const login = useMutation({
    mutationFn: () => loginApi(normalizeEmail(email), password, totpCode || undefined),
    onSuccess: (data) => {
      if (data.user.role !== 'investor') {
        setError('Investor access only');
        return;
      }
      setAuth(data.accessToken, data.user);
      router.replace('/home');
    },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      if (code === 'REQUIRES_2FA') {
        setNeeds2fa(true);
        setError('Enter your authenticator code');
        return;
      }
      setError('Invalid credentials');
    },
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex min-h-[280px] w-full items-center justify-center overflow-hidden bg-primary md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-[#1a1a1a] to-[#c9a227]/50" />
        <div className="relative z-10 max-w-xl px-6 text-center text-white md:px-12 md:text-left">
          <div className="mb-6 inline-flex items-center gap-3">
            <span className="material-symbols-outlined text-5xl text-secondary">trending_up</span>
            <h1 className="font-[family-name:var(--font-headline)] text-3xl font-semibold md:text-4xl">
              InvesPro
            </h1>
          </div>
          <p className="hidden font-[family-name:var(--font-headline)] text-4xl font-semibold md:block">
            Invest with a clear target
          </p>
          <p className="mt-4 text-lg text-white/80">
            Choose an Investment plan to unlock Earnings. Complete payments toward your target and
            redeem when ready.
          </p>
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col items-center justify-center bg-background px-6 py-10 md:w-1/2">
        <div className="w-full max-w-md">
          <header className="mb-8">
            <h2 className="font-[family-name:var(--font-headline)] text-2xl font-bold text-on-background">
              Welcome Back
            </h2>
            <p className="mt-2 text-on-surface-variant">Sign in to your investor account.</p>
          </header>

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              const eMsg = emailError(email);
              if (eMsg) {
                setError(eMsg);
                return;
              }
              login.mutate();
            }}
          >
            <Input
              label="Email Address"
              icon="mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="investor@example.com"
              required
            />
            <Input
              label="Password"
              icon="lock"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-sm font-medium text-secondary hover:underline">
                Forgot password?
              </Link>
            </div>

            {needs2fa && (
              <Input
                label="Authenticator code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                required
              />
            )}

            {error && (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
              Login to Dashboard
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            New investor?{' '}
            <Link href="/register" className="font-semibold text-secondary hover:underline">
              Create account
            </Link>
          </p>

          <footer className="mt-10 flex flex-col items-center gap-2 text-outline opacity-70">
            <div className="flex items-center gap-2 text-xs">
              <span className="material-symbols-outlined text-base">verified_user</span>
              256-bit SSL Encrypted
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
