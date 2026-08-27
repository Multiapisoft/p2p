'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { formatCurrency } from '@/shared/lib/utils';

export function MatchAmountCard({
  applied,
  cap,
  compact,
  onApply,
}: {
  applied: number | null;
  cap?: number | null;
  compact?: boolean;
  onApply: (amount: number) => void;
}) {
  const [value, setValue] = useState(applied != null ? String(applied) : '');
  const maxHint = cap != null && cap > 0 ? cap : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let num = Number(value);
    if (!Number.isFinite(num) || num < 1) return;
    if (maxHint != null) num = Math.min(num, maxHint);
    onApply(num);
    setValue(String(num));
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
          Amount to pay
        </p>
        <p className={compact ? 'text-sm font-bold text-secondary' : 'mt-1 text-lg font-bold text-secondary'}>
          {applied != null ? formatCurrency(applied) : 'Enter amount first'}
        </p>
        <p className="mt-0.5 text-[11px] text-on-surface-variant">
          Full close or ₹5,000+ partial.
          {maxHint != null ? ` Max ${formatCurrency(maxHint)}.` : ''}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Amount"
            type="number"
            min={1}
            step="1"
            max={maxHint ?? undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 5000"
            className={compact ? 'py-2 text-sm' : undefined}
          />
        </div>
        <Button type="submit" size="sm">
          Show matches
        </Button>
      </form>
    </div>
  );
}
