'use client';

import { cn, formatCurrency, formatDate } from '@/shared/lib/utils';
import type { LedgerEntry } from '@/shared/types/api.types';

const TYPE_META: Record<string, { icon: string; label: string }> = {
  deposit: { icon: 'south_west', label: 'Deposit' },
  withdrawal: { icon: 'north_east', label: 'Withdrawal' },
  commission: { icon: 'payments', label: 'Commission' },
  investment: { icon: 'trending_up', label: 'Investment' },
  redemption: { icon: 'redeem', label: 'Redemption' },
  adjustment: { icon: 'tune', label: 'Adjustment' },
  p2p_limit: { icon: 'speed', label: 'Pay limit' },
  credit: { icon: 'add_circle', label: 'Credit' },
  debit: { icon: 'do_not_disturb_on', label: 'Debit' },
  lock: { icon: 'lock', label: 'Lock' },
  unlock: { icon: 'lock_open', label: 'Unlock' },
};

/** Strip refs / object ids from remark title so UI stays clean. */
const REF_NOISE_RE =
  /\b((?:WDR|WDP|DEP|INV|TXN|REF)[-A-Z0-9]+|[a-f0-9]{24})\b/gi;

export function isCreditEntry(
  t: Pick<LedgerEntry, 'direction' | 'balanceAfter' | 'balanceBefore' | 'type'>,
) {
  if (t.direction === 'credit') return true;
  if (t.direction === 'debit') return false;
  if (t.type === 'deposit' || t.type === 'investment' || t.type === 'credit') return true;
  if (t.type === 'withdrawal' || t.type === 'redemption' || t.type === 'debit') return false;
  return t.balanceAfter >= t.balanceBefore;
}

export function typeMeta(type: string) {
  const key = (type || '').toLowerCase();
  return (
    TYPE_META[key] || {
      icon: 'receipt_long',
      label: (type || 'Entry').replace(/_/g, ' '),
    }
  );
}

export function entryRemark(t: LedgerEntry): string {
  if (t.description?.trim()) return t.description.trim();
  const flow = [t.fromParty, t.toParty].filter(Boolean).join(' → ');
  if (flow) return flow;
  if (t.referenceType || t.referenceId) {
    return [t.referenceType, t.referenceId].filter(Boolean).join(' · ');
  }
  return '—';
}

function parseRemark(t: LedgerEntry): { title: string; from?: string; to?: string } {
  const raw = entryRemark(t);

  let title = raw
    .replace(REF_NOISE_RE, '')
    .replace(/\s*[—–-]\s*$/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!title || title === '—') {
    title = typeMeta(t.type).label;
  }

  const from = t.fromParty?.trim() || undefined;
  const to = t.toParty?.trim() || undefined;

  return { title, from, to };
}

function RemarkCell({ t }: { t: LedgerEntry }) {
  const { title, from, to } = parseRemark(t);
  const full = entryRemark(t);
  return (
    <div className="min-w-[180px] max-w-[300px]">
      <p
        className="truncate text-[12px] font-semibold leading-snug text-on-surface"
        title={full}
      >
        {title}
      </p>
      {from || to ? (
        <p className="mt-0.5 truncate text-[10px] leading-tight text-on-surface-variant" title={`${from || '—'} → ${to || '—'}`}>
          <span className="font-medium text-on-surface/80">{from || '—'}</span>
          <span className="mx-1 text-on-surface-variant/70">→</span>
          <span className="font-medium text-on-surface/80">{to || '—'}</span>
        </p>
      ) : null}
    </div>
  );
}

const cellPad = 'px-2 py-1.5 sm:px-2.5';

export function StatementTable({
  items,
  page,
  limit,
  onRowClick,
  showOwner = false,
}: {
  items: LedgerEntry[];
  page: number;
  limit: number;
  onRowClick?: (t: LedgerEntry) => void;
  showOwner?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[900px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-on-surface-variant">
              <th className={cn(cellPad, 'whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide')}>
                Sr
              </th>
              <th className={cn(cellPad, 'whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide')}>
                Date
              </th>
              <th
                className={cn(
                  cellPad,
                  'whitespace-nowrap text-right text-[10px] font-semibold uppercase tracking-wide',
                )}
              >
                Credit
              </th>
              <th
                className={cn(
                  cellPad,
                  'whitespace-nowrap text-right text-[10px] font-semibold uppercase tracking-wide',
                )}
              >
                Debit
              </th>
              <th
                className={cn(
                  cellPad,
                  'whitespace-nowrap text-right text-[10px] font-semibold uppercase tracking-wide',
                )}
              >
                Balance
              </th>
              <th className={cn(cellPad, 'whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide')}>
                Type
              </th>
              {showOwner ? (
                <th className={cn(cellPad, 'whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide')}>
                  Wallet
                </th>
              ) : null}
              <th className={cn(cellPad, 'min-w-[200px] text-[10px] font-semibold uppercase tracking-wide')}>
                Remark
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t, i) => {
              const credit = isCreditEntry(t);
              const meta = typeMeta(t.type);
              const sr = (page - 1) * limit + i + 1;
              return (
                <tr
                  key={t._id}
                  onClick={onRowClick ? () => onRowClick(t) : undefined}
                  className={cn(
                    'border-b border-outline-variant/50 transition',
                    i % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low/25',
                    onRowClick && 'cursor-pointer hover:bg-surface-container-low/60',
                  )}
                >
                  <td className={cn(cellPad, 'tabular-nums text-on-surface-variant')}>{sr}</td>
                  <td className={cn(cellPad, 'whitespace-nowrap text-on-surface-variant')}>
                    {formatDate(t.createdAt)}
                  </td>
                  <td className={cn(cellPad, 'whitespace-nowrap text-right tabular-nums')}>
                    {credit ? (
                      <span className="font-medium text-on-surface">
                        {formatCurrency(t.amount, t.currency)}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className={cn(cellPad, 'whitespace-nowrap text-right tabular-nums')}>
                    {!credit ? (
                      <span className="font-medium text-on-surface">
                        −{formatCurrency(t.amount, t.currency)}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      cellPad,
                      'whitespace-nowrap text-right tabular-nums font-semibold text-on-surface',
                    )}
                  >
                    {formatCurrency(t.balanceAfter, t.currency)}
                  </td>
                  <td className={cellPad}>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-surface-container-high/80 px-1.5 py-0.5 text-[10px] font-medium capitalize leading-none text-on-surface">
                      <span className="material-symbols-outlined text-[12px] text-on-surface-variant">
                        {meta.icon}
                      </span>
                      {meta.label}
                    </span>
                  </td>
                  {showOwner ? (
                    <td className={cn(cellPad, 'max-w-[110px] truncate text-[11px] font-medium')}>
                      {typeof t.userId === 'object' && t.userId && 'name' in t.userId
                        ? String((t.userId as { name?: string }).name || '—')
                        : '—'}
                    </td>
                  ) : null}
                  <td className={cellPad}>
                    <RemarkCell t={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Compact mobile cards mirroring statement columns. */
export function StatementCards({
  items,
  page,
  limit,
  onRowClick,
}: {
  items: LedgerEntry[];
  page: number;
  limit: number;
  onRowClick?: (t: LedgerEntry) => void;
}) {
  return (
    <div className="space-y-2 md:hidden">
      {items.map((t, idx) => {
        const credit = isCreditEntry(t);
        const meta = typeMeta(t.type);
        const sr = (page - 1) * limit + idx + 1;
        const { title, from, to } = parseRemark(t);
        return (
          <button
            key={t._id}
            type="button"
            onClick={onRowClick ? () => onRowClick(t) : undefined}
            className={cn(
              'w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 text-left',
              onRowClick && 'active:bg-surface-container-low',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-[10px] font-semibold text-on-surface-variant">#{sr}</span>
                <span className="inline-flex items-center gap-0.5 rounded-md bg-surface-container-high/80 px-1.5 py-0.5 text-[10px] font-medium capitalize text-on-surface">
                  <span className="material-symbols-outlined text-[11px] text-on-surface-variant">
                    {meta.icon}
                  </span>
                  {meta.label}
                </span>
              </div>
              <span className="shrink-0 text-[12px] font-semibold text-on-surface">
                {credit ? '+' : '−'}
                {formatCurrency(t.amount, t.currency)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-on-surface-variant">
              <span>{formatDate(t.createdAt)}</span>
              <span className="font-medium text-on-surface">
                Bal {formatCurrency(t.balanceAfter, t.currency)}
              </span>
            </div>
            <p className="mt-1 truncate text-[12px] font-semibold text-on-surface" title={title}>
              {title}
            </p>
            {from || to ? (
              <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">
                <span className="font-medium text-on-surface/80">{from || '—'}</span>
                <span className="mx-1">→</span>
                <span className="font-medium text-on-surface/80">{to || '—'}</span>
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
