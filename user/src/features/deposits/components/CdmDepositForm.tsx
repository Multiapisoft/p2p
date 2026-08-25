'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { depositsApi } from '@/features/deposits/api/deposits.api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Card } from '@/shared/components/ui/Card';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { personNameError } from '@/shared/lib/validation';

/** Classic CDM cash-deposit request (admin/business verifies — not P2P pay). */
export function CdmDepositForm() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [payerName, setPayerName] = useState('');
  const [locationHint, setLocationHint] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const create = useMutation({
    mutationFn: () =>
      depositsApi.create({
        amount: Number(amount),
        method: 'cdm',
        cdmDetails: {
          payerName: payerName.trim(),
          locationHint: locationHint.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: (d) => {
      setSuccess(`CDM deposit ${d.referenceId} submitted — waiting for approval`);
      setError('');
      setAmount('');
      setPayerName('');
      setLocationHint('');
      setNotes('');
      qc.invalidateQueries({ queryKey: ['my-classic-deposits'] });
    },
    onError: (err) => {
      setSuccess('');
      setError(getApiErrorMessage(err, 'Could not create CDM deposit'));
    },
  });

  if (!open) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">CDM cash deposit</p>
            <p className="text-sm text-on-surface-variant">
              Deposit via CDM machine — request goes for admin/business approval.
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
            New CDM deposit
          </Button>
        </div>
        {success ? <p className="mt-2 text-sm text-secondary">{success}</p> : null}
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">CDM cash deposit</p>
          <p className="text-sm text-on-surface-variant">
            Enter amount and depositor name after you deposit cash at a CDM.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const num = Number(amount);
          if (!Number.isFinite(num) || num < 1) {
            setError('Enter a valid amount');
            return;
          }
          const nameErr = personNameError(payerName, true);
          if (nameErr) {
            setError(nameErr);
            return;
          }
          create.mutate();
        }}
      >
        <Input
          label="Amount (INR)"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Input
          label="Depositor name"
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          required
        />
        <Input
          label="CDM location (optional)"
          value={locationHint}
          onChange={(e) => setLocationHint(e.target.value)}
          placeholder="e.g. SBI ATM — Connaught Place"
        />
        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error ? (
          <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}
        {success ? <p className="text-sm text-secondary">{success}</p> : null}
        <Button type="submit" className="w-full" loading={create.isPending}>
          Submit CDM deposit
        </Button>
      </form>
    </Card>
  );
}
