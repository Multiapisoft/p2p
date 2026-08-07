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
    if (hydrated && token) router.replace('/');
  }, [hydrated, token, router]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const login = useMutation({
    mutationFn: () => loginApi(normalizeEmail(email), password),
    onSuccess: (data) => {
      if (data.user.role !== 'investor') {
        setError('Investor access only');
        return;
      }
      setAuth(data.accessToken, data.user);
      router.replace('/');
    },
    onError: () => setError('Invalid credentials'),
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex min-h-[280px] w-full items-center justify-center overflow-hidden bg-primary md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-tr from-on-background/60 to-secondary/40" />
        <div className="relative z-10 max-w-xl px-6 text-center text-white md:px-12 md:text-left">
          <div className="mb-6 inline-flex items-center gap-3">
            <span className="material-symbols-outlined text-5xl text-secondary-container">savings</span>
            <h1 className="font-[family-name:var(--font-headline)] text-3xl font-bold md:text-4xl">FinGuard</h1>
          </div>
          <p className="hidden font-[family-name:var(--font-headline)] text-4xl font-bold md:block">
            Investor Portal
          </p>
          <p className="mt-4 text-lg text-surface-container-highest/90">
            Manage investments, track portfolio growth, and redeem earnings securely.
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
            <div>
              <Input
                label="Password"
                icon="lock"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="mt-1 text-xs text-secondary hover:underline"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? 'Hide' : 'Show'} password
              </button>
            </div>

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
