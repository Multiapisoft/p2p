'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { forgotPasswordApi, resetPasswordApi } from '@/features/auth/api/auth.api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { emailError, normalizeEmail } from '@/shared/lib/validation';
import { getApiErrorMessage } from '@/shared/api/client';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const requestCode = useMutation({
    mutationFn: () => forgotPasswordApi(normalizeEmail(email)),
    onSuccess: (data) => {
      setError('');
      setIssuedCode(data.resetCode || '');
      setStep('reset');
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, 'Could not send reset code'));
    },
  });

  const reset = useMutation({
    mutationFn: () =>
      resetPasswordApi(normalizeEmail(email), code.trim(), newPassword),
    onSuccess: (data) => {
      setError('');
      setDone(data.message || 'Password updated. You can sign in now.');
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, 'Could not reset password'));
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <header>
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold">
            Reset password
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Enter your email to get a 6-digit code, then set a new password.
          </p>
        </header>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary-container/40 px-4 py-3 text-sm text-on-secondary-container">
              {done}
            </div>
            <Link href="/login" className="font-semibold text-secondary hover:underline">
              Back to login
            </Link>
          </div>
        ) : step === 'email' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const msg = emailError(email);
              if (msg) {
                setError(msg);
                return;
              }
              requestCode.mutate();
            }}
          >
            <Input
              label="Email Address"
              icon="mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error ? (
              <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {error}
              </div>
            ) : null}
            <Button type="submit" className="w-full" loading={requestCode.isPending}>
              Get reset code
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length !== 6) {
                setError('Enter the 6-digit code');
                return;
              }
              if (newPassword.length < 8) {
                setError('Password must be at least 8 characters');
                return;
              }
              reset.mutate();
            }}
          >
            {issuedCode ? (
              <div className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm">
                Your reset code: <span className="font-mono font-bold tracking-widest">{issuedCode}</span>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Valid for 15 minutes. (Shown here until email delivery is enabled.)
                </p>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">
                If an account exists, use the code that was issued for {normalizeEmail(email)}.
              </p>
            )}
            <Input
              label="Reset code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              required
            />
            <Input
              label="New password"
              type="password"
              icon="lock"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
            {error ? (
              <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {error}
              </div>
            ) : null}
            <Button type="submit" className="w-full" loading={reset.isPending}>
              Update password
            </Button>
            <button
              type="button"
              className="text-sm text-secondary hover:underline"
              onClick={() => {
                setStep('email');
                setError('');
                setIssuedCode('');
                setCode('');
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {!done ? (
          <p className="text-center text-sm text-on-surface-variant">
            <Link href="/login" className="font-semibold text-secondary hover:underline">
              Back to login
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
