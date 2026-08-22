'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Pagination } from '@/shared/components/ui/Pagination';
import { cn, formatCurrency, formatDate } from '@/shared/lib/utils';
import { fetchAllPages, personCsvCells } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { LedgerEntry } from '@/shared/types/api.types';

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'commission', label: 'Commission' },
  { value: 'investment', label: 'Investment' },
  { value: 'redemption', label: 'Redemption' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'p2p_limit', label: 'Pay limit' },
  { value: 'credit', label: 'Credit in' },
  { value: 'debit', label: 'Debit out' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [5, 10, 20];

function partyName(
  value: string | { name?: string; email?: string; role?: string } | undefined,
) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return [value.name, value.role].filter(Boolean).join(' · ');
}

function isCreditEntry(t: LedgerEntry) {
  return t.direction === 'credit' || t.balanceAfter >= t.balanceBefore;
}

function PartyCell({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value?.trim() || '—'}</p>
    </div>
  );
}

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [userIdInput, setUserIdInput] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setUserId(userIdInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, userIdInput]);

  const listQuery = useMemo(
    () => ({ page, limit, type, sort, search, userId }),
    [page, limit, type, sort, search, userId],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', listQuery],
    queryFn: () => transactionsApi.getAll(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const pageStats = useMemo(() => {
    let withFlow = 0;
    let credits = 0;
    let debits = 0;
    for (const t of items) {
      if (t.fromParty || t.toParty) withFlow += 1;
      if (isCreditEntry(t)) credits += 1;
      else debits += 1;
    }
    return { withFlow, credits, debits };
  }, [items]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
            Transaction Ledger
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-on-surface-variant">
            Full wallet trail — who paid how much and who received what. Search by payer, receiver,
            reference, or notes.
          </p>
        </div>
        <CsvDownloadButton<LedgerEntry>
          title="Transaction ledger"
          filename={`ledger-${type}`}
          filters={{ Type: type, Search: search, User: userId, Sort: sort }}
          disabled={!total}
          columns={[
            { header: 'Type', value: (t) => t.type },
            { header: 'Direction', value: (t) => t.direction || '' },
            { header: 'Amount', value: (t) => t.amount },
            { header: 'Currency', value: (t) => t.currency },
            { header: 'Paid by', value: (t) => t.fromParty || '' },
            { header: 'Received by', value: (t) => t.toParty || '' },
            { header: 'Wallet owner', value: (t) => personCsvCells(t.userId)[0] },
            { header: 'Owner email', value: (t) => personCsvCells(t.userId)[1] },
            { header: 'Owner role', value: (t) => personCsvCells(t.userId)[3] },
            { header: 'Reference', value: (t) => t.referenceId },
            { header: 'Description', value: (t) => t.description || '' },
            { header: 'Created', value: (t) => t.createdAt },
          ]}
          fetchRows={() =>
            fetchAllPages((p, l) => transactionsApi.getAll({ ...listQuery, page: p, limit: l }))
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total entries
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{total}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            With payer / receiver
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{pageStats.withFlow}</p>
          <p className="text-[10px] text-on-surface-variant sm:text-xs">On this page</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-secondary-container/20 p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Credits in
          </p>
          <p className="mt-1 text-lg font-bold text-on-secondary-container sm:text-2xl">
            {pageStats.credits}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-error-container/15 p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Debits out
          </p>
          <p className="mt-1 text-lg font-bold text-error sm:text-2xl">{pageStats.debits}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search payer, receiver, reference, notes…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Input
              className="min-w-0 flex-1 sm:min-w-[160px]"
              placeholder="Wallet owner ID (optional)"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
          <div className="chip-scroll">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setType(t.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm',
                  type === t.value ? 'bg-primary text-on-primary' : 'border border-outline-variant',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No ledger entries match your filters" icon="receipt_long" />
        ) : (
          <div className={isFetching ? 'opacity-70' : ''}>
            <div className="space-y-3 md:hidden">
              {items.map((t) => {
                const credit = isCreditEntry(t);
                return (
                  <div
                    key={t._id}
                    className="rounded-xl border border-outline-variant bg-surface-container-low/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold capitalize">{t.type}</p>
                        {t.flow ? (
                          <p className="text-[11px] text-on-surface-variant">
                            {t.flow.replace(/_/g, ' ')}
                          </p>
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          'text-sm font-bold',
                          credit ? 'text-on-secondary-container' : 'text-error',
                        )}
                      >
                        {credit ? '+' : '−'}
                        {formatCurrency(t.amount, t.currency)}
                      </p>
                    </div>

                    <div className="mt-3 grid gap-2 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-3 py-2.5">
                      <PartyCell label="Paid by" value={t.fromParty} />
                      <div className="flex justify-center">
                        <span className="material-symbols-outlined text-base text-secondary">
                          south
                        </span>
                      </div>
                      <PartyCell label="Received by" value={t.toParty} />
                    </div>

                    {t.description ? (
                      <p className="mt-2 text-xs text-on-surface-variant">{t.description}</p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                      <span>Wallet: {partyName(t.userId) || '—'}</span>
                      <span>
                        {formatCurrency(t.balanceBefore, t.currency)} →{' '}
                        {formatCurrency(t.balanceAfter, t.currency)}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-on-surface-variant">
                      {t.referenceType} · {t.referenceId}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">{formatDate(t.createdAt)}</p>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto custom-scrollbar md:block">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-outline-variant bg-surface-container-low">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Date
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Type
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Paid by
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Received by
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Amount
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Wallet owner
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {items.map((t) => {
                    const credit = isCreditEntry(t);
                    return (
                      <tr key={t._id} className="align-top hover:bg-surface-container-low">
                        <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant sm:px-4">
                          {formatDate(t.createdAt)}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <p className="font-medium capitalize">{t.type}</p>
                          {t.flow ? (
                            <p className="text-[11px] text-on-surface-variant">
                              {t.flow.replace(/_/g, ' ')}
                            </p>
                          ) : null}
                          {t.description ? (
                            <p className="mt-1 max-w-[180px] text-[11px] text-on-surface-variant">
                              {t.description}
                            </p>
                          ) : null}
                        </td>
                        <td className="max-w-[180px] px-3 py-3 sm:px-4">
                          <p className="font-medium">{t.fromParty?.trim() || '—'}</p>
                        </td>
                        <td className="max-w-[180px] px-3 py-3 sm:px-4">
                          <p className="font-medium">{t.toParty?.trim() || '—'}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                          <span className={credit ? 'text-on-secondary-container' : 'text-error'}>
                            {credit ? '+' : '−'}
                            {formatCurrency(t.amount, t.currency)}
                          </span>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <p className="text-xs font-medium">{partyName(t.userId) || '—'}</p>
                          <p className="truncate font-mono text-[11px] text-on-surface-variant">
                            {t.referenceType} · {t.referenceId}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant sm:px-4">
                          {formatCurrency(t.balanceBefore, t.currency)} →{' '}
                          {formatCurrency(t.balanceAfter, t.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
