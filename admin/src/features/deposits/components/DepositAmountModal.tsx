'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { formatCurrency } from '@/shared/lib/utils';

export function DepositAmountModal({
  open,
  initialValue,
  title = 'Enter deposit amount',
  description = 'Enter an amount first — payment details will appear after that.',
  submitLabel = 'SUBMIT',
  onClose,
  onApply,
}: {
  open: boolean;
  initialValue?: string;
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
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) {
      setError('Enter a valid amount');
      return;
    }
    onApply(num);
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-on-surface-variant">{description}</p>
        <Input
          label="Amount"
          type="number"
          min={1}
          step="1"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="e.g. 5000"
          autoFocus
          required
        />
        {error ? (
          <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}
        <Button type="submit" className="w-full">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
