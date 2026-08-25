'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { loginApi } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { toast } from '@/shared/ui/toast/toast.store';
import { emailError, normalizeEmail } from '@/shared/lib/validation';
import { getApiErrorMessage } from '@/shared/lib/api-error';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
      if (token) router.replace('/home');
  }, [token, router]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const qEmail = searchParams.get('email');
    if (qEmail) setEmail(qEmail.trim());
  }, [searchParams]);

  const login = useMutation({
    mutationFn: () => loginApi(normalizeEmail(email), password, totpCode || undefined),
    onSuccess: (data) => {
      if (!data?.accessToken || !data?.user) {
        setError('Login response incomplete. Try again.');
        toast.error('Login failed', 'Incomplete response from server');
        return;
      }
      if (data.user.role !== 'user') {
        const portal =
          data.user.role === 'business'
            ? 'Business portal'
            : data.user.role === 'investor'
              ? 'Investor portal'
              : 'Admin portal';
        const msg = `This is a ${data.user.role} account — you cannot log in on the User app. Use the ${portal}.`;
        setError(msg);
        toast.error('Wrong portal', msg);
        return;
      }
      setAuth(data.accessToken, data.user);
      toast.success('Welcome back');
      const next = searchParams.get('next') || searchParams.get('redirect') || '/home';
      router.replace(next.startsWith('/') ? next : '/home');
    },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      if (code === 'REQUIRES_2FA') {
        setNeeds2fa(true);
        const text = 'Enter your authenticator code';
        setError(text);
        toast.error('2FA required', text);
        return;
      }
      const text = getApiErrorMessage(err, 'Invalid email or password');
      setError(text);
      toast.error('Login failed', text);
    },
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex min-h-[180px] w-full items-center justify-center overflow-hidden bg-primary sm:min-h-[220px] md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-tr from-on-background/60 to-secondary/40" />
        <div className="relative z-10 max-w-xl px-5 text-center text-white sm:px-6 md:px-12 md:text-left">
          <div className="mb-3 inline-flex items-center gap-2 sm:mb-6 sm:gap-3">
            <span className="material-symbols-outlined text-4xl text-secondary-container sm:text-5xl">account_balance_wallet</span>
            <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold sm:text-3xl md:text-4xl">
              PaySecure247
            </h1>
          </div>
          <p className="hidden font-[family-name:var(--font-headline)] text-4xl font-bold md:block">
            Your money. Your pace.
          </p>
          <p className="mt-2 text-sm text-surface-container-highest/90 sm:mt-4 sm:text-lg">
            Secure deposits and withdrawals with live Platform Payment matching — no clutter, just
            your wallet.
          </p>
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-10 md:w-1/2">
        <div className="w-full max-w-md">
          <header className="mb-6 sm:mb-8">
            <h2 className="font-[family-name:var(--font-headline)] text-xl font-bold text-on-background sm:text-2xl">
              Welcome Back
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant sm:mt-2">Sign in to your wallet account.</p>
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
              placeholder="you@example.com"
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
              Login
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-semibold text-secondary hover:underline">
              Register
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
