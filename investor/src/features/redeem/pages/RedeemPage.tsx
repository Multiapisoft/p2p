'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { investorApi } from '@/features/investor/api/investor.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { apiErrorMessage, formatCurrency } from '@/shared/lib/utils';
import { accountNumberError, sanitizeAccountNumber } from '@/shared/lib/validation';
import type { CreateRedemptionPayload, PaymentMethod } from '@/shared/types/api.types';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
];

export function RedeemPage() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [note, setNote] = useState('');
  const [upiId, setUpiId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [network, setNetwork] = useState('TRC20');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: redeemable, isLoading } = useQuery({
    queryKey: ['redeemable'],
    queryFn: () => investorApi.getRedeemable(),
  });

  const redeem = useMutation({
    mutationFn: (payload: CreateRedemptionPayload) => investorApi.redeem(payload),
    onSuccess: () => {
      setSuccess('Redemption request submitted successfully!');
      setAmount('');
      setNote('');
      setTimeout(() => router.push('/redemptions'), 1500);
    },
    onError: (err: unknown) => {
      setError(apiErrorMessage(err, 'Redemption request failed'));
    },
  });

  if (isLoading) return <LoadingScreen />;

  const maxAmount = redeemable?.redeemableAmount ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const num = Number(amount);
    if (!num || num < 1) {
      setError('Enter a valid amount (minimum ₹1)');
      return;
    }
    if (num > maxAmount) {
      setError(`Amount exceeds redeemable limit of ${formatCurrency(maxAmount)}`);
      return;
    }

    const payload: CreateRedemptionPayload = { amount: num, method, note: note || undefined };
    if (method === 'upi') {
      if (!upiId.trim()) {
        setError('UPI ID required');
        return;
      }
      payload.upiDetails = { upiId: upiId.trim(), payerName: payerName.trim() || undefined };
    } else if (method === 'bank') {
      const accErr = accountNumberError(accountNumber);
      if (accErr) {
        setError(accErr);
        return;
      }
      if (!ifscCode.trim() || !accountHolderName.trim()) {
        setError('Account number, IFSC and holder name required');
        return;
      }
      payload.bankDetails = {
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim() || undefined,
      };
    } else {
      if (!walletAddress.trim()) {
        setError('USDT wallet address required');
        return;
      }
      payload.usdtDetails = {
        walletAddress: walletAddress.trim(),
        network: network.trim() || 'TRC20',
      };
    }
    redeem.mutate(payload);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold">Redeem Funds</h1>
        <p className="text-on-surface-variant">
          Cash out redeemable INR points via UPI, Bank, or USDT (admin settles)
        </p>
      </div>

      <div className="rounded-xl border border-secondary-container bg-secondary-container/20 p-4">
        <p className="text-sm text-on-surface-variant">Available to redeem</p>
        <p className="font-[family-name:var(--font-headline)] text-2xl font-bold text-on-secondary-container">
          {formatCurrency(maxAmount)}
        </p>
      </div>

      <Card>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <Input
            label="Redemption Amount (INR)"
            icon="payments"
            type="number"
            min={1}
            max={maxAmount}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="5000"
            required
          />

          <button
            type="button"
            className="text-sm text-secondary hover:underline"
            onClick={() => setAmount(String(maxAmount))}
          >
            Redeem full amount ({formatCurrency(maxAmount)})
          </button>

          <div>
            <p className="mb-2 text-sm font-semibold">Payout method</p>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    method === m.value
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {method === 'upi' && (
            <>
              <Input
                label="UPI ID *"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@upi"
                required
              />
              <Input
                label="Name (optional)"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
              />
            </>
          )}

          {method === 'bank' && (
            <>
              <Input
                label="Account number *"
                value={accountNumber}
                onChange={(e) => setAccountNumber(sanitizeAccountNumber(e.target.value))}
                inputMode="numeric"
                maxLength={18}
                required
              />
              <Input
                label="IFSC *"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                required
              />
              <Input
                label="Account holder *"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                required
              />
              <Input
                label="Bank name (optional)"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </>
          )}

          {method === 'usdt' && (
            <>
              <Input
                label="USDT wallet address *"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                required
              />
              <Input
                label="Network"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                placeholder="TRC20"
              />
            </>
          )}

          <Textarea
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any extra payout instructions…"
          />

          {error && (
            <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
              {success}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={redeem.isPending}
            disabled={maxAmount <= 0}
          >
            Submit Redemption Request
          </Button>
        </form>
      </Card>
    </div>
  );
}
