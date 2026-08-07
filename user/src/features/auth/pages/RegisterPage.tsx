'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { registerApi } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { toast } from '@/shared/ui/toast/toast.store';
import {
  emailError,
  normalizeEmail,
  normalizePhone,
  phoneError,
} from '@/shared/lib/validation';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  const codeFromLink = (searchParams.get('code') || searchParams.get('ref') || '').trim();
  const lockedFromLink = Boolean(codeFromLink);

  useEffect(() => {
    if (token) router.replace('/');
  }, [token, router]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState(codeFromLink);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (codeFromLink) setReferralCode(codeFromLink);
  }, [codeFromLink]);

  const register = useMutation({
    mutationFn: () =>
      registerApi({
        name,
        email: normalizeEmail(email),
        password,
        phone: phone.trim() ? normalizePhone(phone) : undefined,
        referralCode: referralCode.trim(),
      }),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      toast.success('Account created', 'Welcome to FinGuard');
      router.replace('/');
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data
              ?.message
          : undefined;
      const text = Array.isArray(msg) ? msg[0] : msg;
      setError(text || 'Registration failed. Email may already be in use.');
      toast.error('Registration failed', text || 'Email may already be in use');
    },
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex min-h-[160px] w-full items-center justify-center overflow-hidden bg-primary sm:min-h-[200px] md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-tr from-on-background/60 to-secondary/40" />
        <div className="relative z-10 px-5 text-center text-white sm:px-6 md:px-12 md:text-left">
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold sm:text-3xl md:text-4xl">Join FinGuard</h1>
          <p className="mt-2 text-sm text-surface-container-highest/90 sm:mt-4 sm:text-lg">
            Create your wallet with a business invite, or open via their integration portal.
          </p>
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-10 md:w-1/2">
        <div className="w-full max-w-md">
          <header className="mb-6 sm:mb-8">
            <h2 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Create Account</h2>
            <p className="mt-1 text-sm text-on-surface-variant sm:mt-2">
              Register with a business code, or use the business integration link.
            </p>
          </header>

          {lockedFromLink ? (
            <div className="mb-4 rounded-lg border border-secondary/30 bg-secondary-container/20 px-4 py-3 text-sm text-on-surface">
              Joining with business code{' '}
              <code className="font-mono font-semibold">{codeFromLink}</code>
            </div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              const eMsg = emailError(email);
              if (eMsg) {
                setError(eMsg);
                return;
              }
              const pMsg = phoneError(phone, false);
              if (pMsg) {
                setError(pMsg);
                return;
              }
              if (!referralCode.trim()) {
                setError('Business code is required. Use the invite link from your business.');
                return;
              }
              register.mutate();
            }}
          >
            <Input label="Full Name" icon="person" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              label="Email"
              icon="mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
            <Input
              label="Phone (optional)"
              icon="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="numeric"
              maxLength={13}
            />
            <Input
              label="Business code"
              icon="redeem"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="Enter business code"
              required
              readOnly={lockedFromLink}
            />
            <p className="-mt-2 text-xs text-on-surface-variant">
              Required. Get this from your business invite link, or ask them for the code. Partner
              apps can also register you via integration API keys.
            </p>
            <Input
              label="Password"
              icon="lock"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              required
            />

            {error && (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">{error}</div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
              Create Account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-secondary hover:underline">
              Login
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
