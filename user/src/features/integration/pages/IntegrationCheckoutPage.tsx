'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { integrationApi } from '../api/integration.api';
import { withdrawalsApi } from '@/features/withdrawals/api/withdrawals.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { toast } from '@/shared/ui/toast/toast.store';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  sanitizeAccountNumber,
  upiIdError,
} from '@/shared/lib/validation';
import type { PaymentMethod } from '@/shared/types/api.types';

function redirectBack(returnUrl: string, params: Record<string, string>) {
  const url = new URL(returnUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  window.location.href = url.toString();
}

function IntegrationCheckoutInner({ type }: { type: 'deposit' | 'withdrawal' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [session, setSession] = useState<Awaited<ReturnType<typeof integrationApi.getSession>> | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [upiId, setUpiId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Missing integration token');
      setStep('error');
      return;
    }

    let cancelled = false;

    integrationApi
      .getSession(token)
      .then(async (s) => {
        if (cancelled) return null;
        if (s.type !== type) {
          setError(`Invalid session type: expected ${type}`);
          setStep('error');
          return null;
        }
        setSession(s);
        const claim = await integrationApi.claim(token);
        return { s, claim };
      })
      .then((result) => {
        if (cancelled || !result) return;
        const { s, claim } = result;
        setAuth(claim.accessToken, claim.user as Parameters<typeof setAuth>[1]);

        // Partner deposit = pay open withdrawals on FinGuard deposits page
        if (type === 'deposit') {
          const amount = s.amount;
          try {
            sessionStorage.setItem(
              'partner_deposit_ctx',
              JSON.stringify({
                token,
                returnUrl: s.returnUrl || claim.session?.returnUrl || '',
                amount: Number(amount) || 0,
                externalRef: s.externalRef || claim.session?.externalRef || '',
              }),
            );
          } catch {
            /* ignore */
          }
          const q =
            amount && Number(amount) > 0
              ? `?tab=pay&payAmount=${amount}`
              : '?tab=pay';
          router.replace(`/deposits${q}`);
          return;
        }

        setStep('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : 'Failed to load integration session';
        setError(msg || 'Invalid or expired link');
        setStep('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, type, setAuth, router]);

  const submitWithdrawal = useMutation({
    mutationFn: () => {
      if (method === 'upi') {
        const err = upiIdError(upiId) || personNameError(payerName, true);
        if (err) throw new Error(err);
      } else if (method === 'bank') {
        const err =
          accountNumberError(accountNumber) ||
          ifscError(ifscCode) ||
          personNameError(accountHolderName, true) ||
          bankNameError(bankName);
        if (err) throw new Error(err);
      } else if (!walletAddress.trim()) {
        throw new Error('Wallet address is required');
      }

      return withdrawalsApi.create({
        amount: session!.amount,
        method,
        integrationToken: token,
        upiDetails:
          method === 'upi'
            ? { upiId: upiId.trim(), payerName: payerName.trim() }
            : undefined,
        bankDetails:
          method === 'bank'
            ? {
                accountNumber: accountNumber.trim(),
                ifscCode: ifscCode.trim().toUpperCase(),
                accountHolderName: accountHolderName.trim(),
                bankName: bankName.trim(),
              }
            : undefined,
        usdtDetails:
          method === 'usdt'
            ? { walletAddress: walletAddress.trim(), network: 'TRC20' }
            : undefined,
      });
    },
    onSuccess: (withdrawal) => {
      setStep('done');
      toast.success('Withdrawal submitted');
      if (session?.returnUrl) {
        redirectBack(session.returnUrl, {
          status: 'pending',
          type: 'withdrawal',
          referenceId: withdrawal.referenceId,
          amount: String(withdrawal.amount),
        });
      }
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Withdrawal failed. Check your balance and details.';
      setError(msg);
      toast.error('Withdrawal failed', msg);
    },
  });

  if (type === 'deposit' && step === 'loading') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <LoadingScreen />
        <p className="mt-4 text-sm text-on-surface-variant">Opening deposits — pay open withdrawal requests…</p>
      </div>
    );
  }

  if (step === 'loading') return <LoadingScreen />;

  if (step === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-semibold text-error">Integration Error</p>
        <p className="mt-2 text-sm text-on-surface-variant">{error}</p>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-semibold text-secondary">Submitted successfully</p>
        <p className="mt-2 text-sm text-on-surface-variant">Redirecting back to partner…</p>
      </div>
    );
  }

  // Withdrawal checkout form (deposit redirects to /deposits)
  return (
    <div className="mx-auto max-w-lg space-y-4 px-3 py-6 sm:space-y-6 sm:px-4 sm:py-8">
      <div>
        <p className="text-xs font-medium text-secondary sm:text-sm">Secure redirect from partner</p>
        <h1 className="text-xl font-bold sm:text-2xl">Partner Withdrawal</h1>
        <p className="break-all text-sm text-on-surface-variant">
          Amount: <strong>₹{session?.amount}</strong>
          {session?.user && <> · {session.user.email}</>}
        </p>
      </div>

      <Card title="Complete on FairPlay">
        <p className="mb-3 text-sm text-on-surface-variant sm:mb-4">
          Complete your withdrawal here. On approval, funds return to your business partner wallet.
        </p>

        <div className="chip-scroll mb-3 sm:mb-4">
          {(['upi', 'bank', 'usdt'] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize sm:px-4 sm:py-2 sm:text-sm ${
                method === m ? 'bg-primary text-on-primary' : 'border border-outline-variant'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {method === 'upi' && (
          <>
            <Input label="UPI ID" value={upiId} onChange={(e) => setUpiId(e.target.value)} required />
            <Input
              label="Account name *"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              required
            />
          </>
        )}
        {method === 'bank' && (
          <>
            <Input
              label="Account Number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(sanitizeAccountNumber(e.target.value))}
              inputMode="numeric"
              maxLength={18}
              required
            />
            <Input label="IFSC" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} required />
            <Input label="Account Holder" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} required />
            <Input
              label="Bank name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              required
            />
          </>
        )}
        {method === 'usdt' && (
          <Input label="Wallet Address" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} required />
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">{error}</div>
        )}

        <Button
          className="mt-4 w-full"
          loading={submitWithdrawal.isPending}
          onClick={() => {
            setError('');
            submitWithdrawal.mutate();
          }}
        >
          Withdraw ₹{session?.amount}
        </Button>
      </Card>
    </div>
  );
}

export function IntegrationCheckoutPage({ type }: { type: 'deposit' | 'withdrawal' }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <IntegrationCheckoutInner type={type} />
    </Suspense>
  );
}
