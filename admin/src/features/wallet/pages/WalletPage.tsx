'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { walletApi } from '../api/wallet.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';

export function WalletPage() {
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState('');

  const adjust = useMutation({
    mutationFn: () =>
      walletApi.adjust(userId, Number(amount), type, reason),
    onSuccess: () => {
      setSuccess('Wallet adjusted successfully');
      setAmount('');
      setReason('');
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Wallet Adjust</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Credit or debit user wallet balance manually. History shows under Transactions → Adjustment.
        </p>
      </div>

      <Card title="Adjust Balance">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSuccess('');
            adjust.mutate();
          }}
        >
          <Input
            label="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="MongoDB user _id"
            required
          />
          <Input
            label="Amount"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <div>
            <p className="mb-2 text-sm font-semibold">Type</p>
            <div className="chip-scroll">
              {(['credit', 'debit'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize sm:px-4 sm:py-2 sm:text-sm ${
                    type === t ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for adjustment (audit trail)"
            required
          />
          {success && (
            <div className="rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
              {success}
            </div>
          )}
          {adjust.isError && (
            <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              Failed to adjust wallet. Check user ID and amount.
            </div>
          )}
          <Button type="submit" className="w-full sm:w-auto" loading={adjust.isPending}>
            Apply Adjustment
          </Button>
        </form>
      </Card>
    </div>
  );
}
