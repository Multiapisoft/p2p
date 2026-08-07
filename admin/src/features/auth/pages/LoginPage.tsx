'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { loginApi } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { emailError, normalizeEmail } from '@/shared/lib/validation';

export function LoginPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (token) router.replace('/');
  }, [token, router]);

  const [email, setEmail] = useState('admin@p2p.local');
  const [password, setPassword] = useState('Admin@123456');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const login = useMutation({
    mutationFn: () => loginApi(normalizeEmail(email), password),
    onSuccess: (data) => {
      if (data.user.role !== 'admin' && data.user.role !== 'sub_admin') {
        setError('Admin access only');
        return;
      }
      setAuth(data.accessToken, data.user);
      router.replace('/');
    },
    onError: () => setError('Invalid credentials'),
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Hero */}
      <div className="relative flex min-h-[220px] w-full items-center justify-center overflow-hidden bg-primary sm:min-h-[280px] md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-tr from-on-background/60 to-secondary/40" />
        <div className="relative z-10 max-w-xl px-5 text-center text-white sm:px-6 md:px-12 md:text-left">
          <div className="mb-4 inline-flex items-center gap-2 sm:mb-6 sm:gap-3">
            <span className="material-symbols-outlined text-4xl text-secondary-container sm:text-5xl">shield_lock</span>
            <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold sm:text-3xl md:text-4xl">FinGuard</h1>
          </div>
          <p className="hidden font-[family-name:var(--font-headline)] text-4xl font-bold md:block">
            Admin Control Center
          </p>
          <p className="mt-3 text-sm text-surface-container-highest/90 sm:mt-4 sm:text-lg">
            Platform Payment management — deposits, withdrawals, businesses & investors.
          </p>
        </div>
      </div>

      {/* Form */}
      <main className="flex w-full flex-1 flex-col items-center justify-center bg-background px-5 py-8 sm:px-6 sm:py-10 md:w-1/2">
        <div className="w-full max-w-md">
          <header className="mb-6 sm:mb-8">
            <h2 className="font-[family-name:var(--font-headline)] text-xl font-bold text-on-background sm:text-2xl">
              Welcome Back
            </h2>
            <p className="mt-1.5 text-sm text-on-surface-variant sm:mt-2">Sign in to manage the Platform Payment system.</p>
          </header>

          <form
            className="space-y-4 sm:space-y-5"
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
              placeholder="admin@p2p.local"
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
