'use client';

import { useState } from 'react';
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
  readOnly,
  allowChangePlan,
  changePending,
  changeError,
  onAdd,
  onChangePlan,
}: {
  remaining: number;
  added: number;
  lots: InvestorLimitLot[];
  compact?: boolean;
  pending?: boolean;
  error?: unknown;
  planAmounts?: number[];
  firstLogin?: boolean;
  /** Summary only — no add form or plan buttons (unless allowChangePlan). */
  readOnly?: boolean;
  /** Show Change plan control while a plan is already active. */
  allowChangePlan?: boolean;
  changePending?: boolean;
  changeError?: unknown;
  onAdd: (amount: number) => void;
  onChangePlan?: (amount: number) => void;
}) {
  const [changing, setChanging] = useState(false);
  const used = Math.max(0, added - remaining);
  const plans = (planAmounts?.length ? planAmounts : DEFAULT_PLANS).filter((n) => n > 0);
  const busy = !!(pending || changePending);

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {firstLogin ? (
        <div>
          <p className="text-sm font-semibold text-on-surface">
            Choose an Investment plan to unlock Earnings
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Pick a plan, then pay assigned withdrawals one by one toward your target.
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
          <div className="flex flex-col items-end gap-1">
            <p className="text-xs text-on-surface-variant">
              Added {formatCurrency(added)}
              {used > 0 ? ` · Used ${formatCurrency(used)}` : ''}
            </p>
            {allowChangePlan && onChangePlan && !changing ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-secondary underline-offset-2 hover:underline"
                onClick={() => setChanging(true)}
              >
                Change plan
              </button>
            ) : null}
          </div>
        </div>
      )}

      {firstLogin && !readOnly && (
        <div className="flex flex-wrap gap-2">
          {plans.map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => onAdd(p)}
              className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:bg-secondary-container disabled:opacity-50"
            >
              {formatCurrency(p)}
            </button>
          ))}
        </div>
      )}

      {changing && allowChangePlan && onChangePlan ? (
        <div className="space-y-2 rounded-lg border border-outline-variant/60 bg-surface-container-low/40 p-3">
          <p className="text-xs font-semibold text-on-surface">Choose a new plan</p>
          <p className="text-[11px] text-on-surface-variant">
            This replaces your plan. Amount already paid stays used; remaining = new plan − used.
          </p>
          <div className="flex flex-wrap gap-2">
            {plans.map((p) => (
              <button
                key={`change-${p}`}
                type="button"
                disabled={busy}
                onClick={() => onChangePlan(p)}
                className="rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:bg-secondary-container disabled:opacity-50"
              >
                {formatCurrency(p)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-[11px] font-medium text-on-surface-variant underline-offset-2 hover:underline"
            disabled={busy}
            onClick={() => setChanging(false)}
          >
            Cancel
          </button>
          {changeError ? (
            <p className="text-xs text-error">
              {apiErrorMessage(changeError, 'Could not change plan')}
            </p>
          ) : null}
        </div>
      ) : null}

      {firstLogin && error ? (
        <p className="text-xs text-error">{apiErrorMessage(error, 'Could not choose plan')}</p>
      ) : firstLogin ? (
        <p className="text-[11px] text-on-surface-variant">
          After choosing a plan, the next payable withdrawal will appear automatically.
        </p>
      ) : readOnly && !changing ? (
        <p className="text-[11px] text-on-surface-variant">
          Complete each assigned payment in order. You can skip USDT or requests above 1.3× your
          remaining limit.
        </p>
      ) : null}

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
