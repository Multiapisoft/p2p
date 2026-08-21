'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { transactionsApi } from '../api/transactions.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import type { LedgerEntry } from '@/shared/types/api.types';

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'credit', label: 'Credit' },
  { value: 'debit', label: 'Debit' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'adjustment', label: 'Adjustment' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [5, 10, 20];

function transactionErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) return msg.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not load transactions';
}

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, type, search, sort }),
    [page, limit, type, search, sort],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['transactions', listQuery],
    queryFn: () => transactionsApi.getMy(listQuery),
    refetchInterval: 10_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
            Transactions
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">Your wallet ledger history</p>
        </div>
        <CsvDownloadButton<LedgerEntry>
          title="My ledger"
          filename="ledger"
          filters={{ Type: type, Search: search, Sort: sort }}
          disabled={!total}
          columns={[
            { header: 'Type', value: (t) => t.type },
            { header: 'Direction', value: (t) => t.direction },
            { header: 'Amount', value: (t) => t.amount },
            { header: 'Currency', value: (t) => t.currency },
            { header: 'Description', value: (t) => t.description },
            { header: 'Created', value: (t) => t.createdAt },
          ]}
          fetchRows={() =>
            fetchAllPages((page, limit) => transactionsApi.getMy({ ...listQuery, page, limit }))
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Total
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{total}</p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">Matching filters</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Page
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{items.length}</p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">Current page</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Credits
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">
            {items.filter((tx) => tx.type === 'credit' || tx.type === 'deposit').length}
          </p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">On this page</p>
        </div>
      </div>

      <Card title="Ledger">
        <div className="mb-4 space-y-3 sm:mb-5 sm:space-y-4">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:gap-3">
            <div className="min-w-0 flex-1">
              <Input
                label="Search"
                icon="search"
                placeholder="Description, reference…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:w-[280px]">
              <label className="flex flex-col gap-1 text-xs font-semibold sm:text-sm">
                Sort
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:text-sm">
                Per page
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  type === t.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
              {transactionErrorMessage(error) || 'Could not load transactions'}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || type !== 'all'
                ? 'No transactions match your filters'
                : 'No transactions yet'
            }
            icon="receipt_long"
          />
        ) : (
          <>
            <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((tx) => (
                <div
                  key={tx._id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant p-3 sm:gap-3 sm:rounded-xl sm:p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold capitalize sm:text-base">{tx.type}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-on-surface-variant sm:text-xs">
                      {tx.fromParty || tx.toParty
                        ? `${tx.fromParty || '—'} → ${tx.toParty || '—'}`
                        : tx.description || tx.referenceType}{' '}
                      · {formatDate(tx.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold sm:text-base ${
                        tx.direction === 'credit' || tx.type === 'deposit' || tx.type === 'investment'
                          ? 'text-on-secondary-container'
                          : 'text-error'
                      }`}
                    >
                      {tx.direction === 'debit' || tx.type === 'withdrawal' || tx.type === 'redemption'
                        ? '-'
                        : '+'}
                      {formatCurrency(tx.amount, tx.currency)}
                    </p>
                    <p className="text-[11px] text-on-surface-variant sm:text-xs">
                      Bal: {formatCurrency(tx.balanceAfter, tx.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
