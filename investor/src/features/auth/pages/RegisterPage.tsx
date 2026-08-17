'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { registerApi } from '@/features/auth/api/auth.api';
import { useAuthHydrated } from '@/features/auth/hooks/useAuthHydrated';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import {
  emailError,
  normalizeEmail,
  normalizePhone,
  phoneError,
} from '@/shared/lib/validation';

export function RegisterPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (hydrated && token) router.replace('/home');
  }, [hydrated, token, router]);

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
      }),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      router.replace('/home');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Registration failed';
      setError(typeof msg === 'string' ? msg : 'Registration failed');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
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
      <div className="relative flex min-h-[200px] w-full items-center justify-center overflow-hidden bg-primary md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-[#1a1a1a] to-[#c9a227]/50" />
        <div className="relative z-10 max-w-xl px-6 text-center text-white md:px-12 md:text-left">
          <div className="mb-4 inline-flex items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-secondary">trending_up</span>
            <h1 className="font-[family-name:var(--font-headline)] text-2xl font-semibold md:text-3xl">
              InvesPro
            </h1>
          </div>
          <p className="text-lg text-white/80">
            Join as an investor and grow your portfolio with clear targets and Platform Payment
            fulfillment.
          </p>
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col items-center justify-center bg-background px-6 py-10 md:w-1/2">
        <div className="w-full max-w-md">
          <header className="mb-8">
            <h2 className="font-[family-name:var(--font-headline)] text-2xl font-bold">Create Investor Account</h2>
            <p className="mt-2 text-on-surface-variant">Register to invest and earn returns.</p>
          </header>

          <form className="space-y-4" onSubmit={handleSubmit}>
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
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">{error}</div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
              Create Account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-secondary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
