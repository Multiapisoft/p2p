'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { formatCurrency } from '@/shared/lib/utils';

export function InvestAmountModal({
  open,
  initialValue,
  cap,
  title = 'Enter amount first',
  description = 'Enter an amount first — matching withdrawal requests will appear after that.',
  submitLabel = 'Show matching list',
  onClose,
  onApply,
}: {
  open: boolean;
  initialValue?: string;
  cap?: number | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  onClose: () => void;
  onApply: (amount: number) => void;
}) {
  const [value, setValue] = useState(initialValue ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? '');
      setError('');
    }
  }, [open, initialValue]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let num = Number(value);
    if (!Number.isFinite(num) || num < 1) {
      setError('Enter a valid amount');
      return;
    }
    if (cap != null && cap > 0) num = Math.min(num, cap);
    onApply(num);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button type="submit" form="invest-amount-form" className="w-full">
          {submitLabel}
        </Button>
      }
    >
      <form id="invest-amount-form" className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-on-surface-variant">{description}</p>
        <Input
          label="Amount (INR)"
          type="number"
          min={1}
          step="1"
          max={cap ?? undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="e.g. 5000"
          autoFocus
          required
        />
        {cap != null && cap > 0 ? (
          <p className="text-xs text-on-surface-variant">Max {formatCurrency(cap)}</p>
        ) : null}
        {error ? (
          <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
