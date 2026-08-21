'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import type { InvestorLimitLot } from '@/features/fulfill/api/fulfill.api';

const DEFAULT_PLANS = [25000, 50000, 75000, 100000, 200000];

export function InvestorLimitPanel({
  remaining,
  added,
  lots,
  compact,
  pending,
  error,
  planAmounts,
  firstLogin,
  onAdd,
}: {
  remaining: number;
  added: number;
  lots: InvestorLimitLot[];
  compact?: boolean;
  pending?: boolean;
  error?: unknown;
  planAmounts?: number[];
  firstLogin?: boolean;
  onAdd: (amount: number) => void;
}) {
  const [amount, setAmount] = useState('');
  const used = Math.max(0, added - remaining);
  const plans = (planAmounts?.length ? planAmounts : DEFAULT_PLANS).filter((n) => n > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 1) return;
    onAdd(num);
    setAmount('');
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {firstLogin ? (
        <div>
          <p className="text-sm font-semibold text-on-surface">
            Choose an Investment plan to unlock Earnings
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Pick a plan, then start making payments toward your target.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Pay limit (LIFO)
            </p>
            <p className={`font-bold text-secondary ${compact ? 'text-sm' : 'mt-1 text-2xl'}`}>
              {formatCurrency(remaining)} left
            </p>
          </div>
          <p className="text-xs text-on-surface-variant">
            Added {formatCurrency(added)}
            {used > 0 ? ` · Used ${formatCurrency(used)}` : ''}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {plans.map((p) => (
          <button
            key={p}
            type="button"
            disabled={pending}
            onClick={() => onAdd(p)}
            className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:bg-secondary-container disabled:opacity-50"
          >
            {formatCurrency(p)}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label={firstLogin ? 'Or enter custom amount' : 'Add amount'}
            type="number"
            min={1}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 10000"
            className={compact ? 'py-2 text-sm' : undefined}
          />
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={pending}>
          {firstLogin ? 'Choose plan' : 'Add'}
        </Button>
      </form>
      {error ? (
        <p className="text-xs text-error">{apiErrorMessage(error, 'Could not add amount')}</p>
      ) : (
        <p className="text-[11px] text-on-surface-variant">
          Newest lot is used first when you pay.
        </p>
      )}

      {lots.length > 0 && (
        <ul className="divide-y divide-outline-variant/40 overflow-hidden rounded-lg border border-outline-variant/60">
          {lots.map((lot, i) => (
            <li
              key={`${lot.createdAt}-${i}`}
              className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <div>
                <p className="font-semibold">{formatCurrency(lot.amount)}</p>
                <p className="text-[10px] text-on-surface-variant">{formatDate(lot.createdAt)}</p>
              </div>
              <p className="font-semibold text-secondary">
                {formatCurrency(lot.remaining)} left
                {i === 0 ? (
                  <span className="ml-1 text-[10px] font-medium text-on-surface-variant">
                    · next
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
