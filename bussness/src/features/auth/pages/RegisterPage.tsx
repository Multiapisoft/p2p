'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { registerApi } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import Link from 'next/link';
import {
  emailError,
  normalizeEmail,
  normalizePhone,
  phoneError,
} from '@/shared/lib/validation';

export function RegisterPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPendingApiCredentials = useAuthStore((s) => s.setPendingApiCredentials);

  useEffect(() => {
    if (token) router.replace('/');
  }, [token, router]);

  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const register = useMutation({
    mutationFn: () =>
      registerApi({
        name,
        email: normalizeEmail(email),
        password,
        phone: phone.trim() ? normalizePhone(phone) : undefined,
        businessName: businessName.trim() || name.trim(),
      }),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      if (data.apiKey && data.apiSecret) {
        setPendingApiCredentials(data.apiKey, data.apiSecret, data.internalSecret ?? null);
      }
      // Dashboard shows referral/business code immediately — no partner URL setup required
      router.replace('/?registered=1');
    },
    onError: () => setError('Registration failed. Email may already be in use.'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!businessName.trim() && !name.trim()) {
      setError('Business name is required');
      return;
    }
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
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    register.mutate();
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex min-h-[240px] w-full items-center justify-center overflow-hidden bg-primary md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-tr from-on-background/60 to-secondary/40" />
        <div className="relative z-10 max-w-xl px-6 text-center text-white md:px-12 md:text-left">
          <div className="mb-6 inline-flex items-center gap-3">
            <span className="material-symbols-outlined text-5xl text-secondary-container">
              business_center
            </span>
            <h1 className="font-[family-name:var(--font-headline)] text-3xl font-bold md:text-4xl">
              FinGuard
            </h1>
          </div>
          <p className="mt-4 text-lg text-surface-container-highest/90">
            Create a business account — your referral / business code is generated instantly. Partner
            API URLs are optional later.
          </p>
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col items-center justify-center bg-background px-6 py-10 md:w-1/2">
        <div className="w-full max-w-md">
          <header className="mb-8">
            <h2 className="font-[family-name:var(--font-headline)] text-2xl font-bold">
              Create Business Account
            </h2>
            <p className="mt-2 text-on-surface-variant">
              Business code is created with your account — no URL required.
            </p>
          </header>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Business name"
              icon="store"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your company / brand name"
              required
            />
            <Input
              label="Contact name"
              icon="person"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Email"
              icon="mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Phone (optional)"
              icon="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Password"
              icon="lock"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              label="Confirm Password"
              icon="lock"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            {error && (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
              Create Account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Already registered?{' '}
            <Link href="/login" className="font-semibold text-secondary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
