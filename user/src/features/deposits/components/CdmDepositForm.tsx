'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { depositsApi } from '@/features/deposits/api/deposits.api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Card } from '@/shared/components/ui/Card';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { bankNameError, personNameError } from '@/shared/lib/validation';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { liveQueryOptions } from '@/shared/constants/live-query';

/** Classic CDM cash-deposit request (admin/business verifies — not P2P pay). */
export function CdmDepositForm() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [payerName, setPayerName] = useState('');
  const [locationHint, setLocationHint] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: myCdm } = useQuery({
    queryKey: ['my-classic-deposits', 'cdm'],
    queryFn: () => depositsApi.getMy({ method: 'cdm', limit: 10, sort: 'newest' }),
    ...liveQueryOptions,
  });

  const create = useMutation({
    mutationFn: () =>
      depositsApi.create({
        amount: Number(amount),
        method: 'cdm',
        cdmDetails: {
          bankName: bankName.trim(),
          payerName: payerName.trim() || undefined,
          locationHint: locationHint.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: (d) => {
      setSuccess(`CDM request ${d.referenceId} submitted — waiting for approval`);
      setError('');
      setAmount('');
      setBankName('');
      setPayerName('');
      setLocationHint('');
      setNotes('');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['my-classic-deposits'] });
    },
    onError: (err) => {
      setSuccess('');
      setError(getApiErrorMessage(err, 'Could not create CDM deposit'));
    },
  });

  const items = myCdm?.items ?? [];

  return (
    <div className="space-y-4">
      {!open ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">CDM deposit request</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Enter bank name and amount. Business / admin will review your request.
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
              New CDM request
            </Button>
          </div>
          {success ? <p className="mt-2 text-sm text-secondary">{success}</p> : null}
        </Card>
      ) : (
        <Card>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">CDM deposit request</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Bank name and amount are required.
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
              const bankErr = bankNameError(bankName, true);
              if (bankErr) {
                setError(bankErr);
                return;
              }
              if (payerName.trim()) {
                const nameErr = personNameError(payerName, false);
                if (nameErr) {
                  setError(nameErr);
                  return;
                }
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
              label="Bank name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. State Bank of India"
              required
            />
            <Input
              label="Depositor name (optional)"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
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
            <Button type="submit" className="w-full" loading={create.isPending}>
              Submit CDM request
            </Button>
          </form>
        </Card>
      )}

      {items.length > 0 ? (
        <Card>
          <p className="mb-3 text-sm font-semibold">My CDM requests</p>
          <ul className="divide-y divide-outline-variant/60">
            {items.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">
                    {formatCurrency(d.amount, d.currency)}
                    {d.cdmDetails?.bankName ? (
                      <span className="ml-2 text-sm font-normal text-on-surface-variant">
                        · {d.cdmDetails.bankName}
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-[11px] text-on-surface-variant">
                    {d.referenceId} · {formatDate(d.createdAt)}
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
