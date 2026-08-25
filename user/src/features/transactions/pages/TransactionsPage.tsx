'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { transactionsApi } from '../api/transactions.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { cn, formatCurrency } from '@/shared/lib/utils';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import type { LedgerEntry } from '@/shared/types/api.types';
import {
  StatementCards,
  StatementTable,
} from '../components/ledger-ui';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'credit', label: 'Credit' },
  { value: 'debit', label: 'Debit' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'adjustment', label: 'Adjustment' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [10, 20, 50];

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

  const { data: balance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance(),
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['transactions', listQuery],
    queryFn: () => transactionsApi.getMy(listQuery),
    refetchInterval: 10_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const available = balance?.availableBalance ?? balance?.balance ?? 0;
  const currency = balance?.currency || items[0]?.currency || 'INR';

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Wallet statement
          </p>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
            Combined ledger
          </h1>
          <p className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">
            {formatCurrency(available, currency)}
          </p>
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
            { header: 'Balance', value: (t) => t.balanceAfter },
            { header: 'Currency', value: (t) => t.currency },
            { header: 'Description', value: (t) => t.description },
            { header: 'Created', value: (t) => t.createdAt },
          ]}
          fetchRows={() =>
            fetchAllPages((page, limit) => transactionsApi.getMy({ ...listQuery, page, limit }))
          }
        />
      </div>

      <Card title="Statement">
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <Input
                label="Search"
                icon="search"
                placeholder="Remark, reference…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:w-[260px]">
              <select
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2.5 text-sm"
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
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2.5 text-sm"
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
                  'rounded-full px-3 py-1.5 text-xs font-semibold',
                  type === t.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest',
                )}
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
            <p className="text-sm font-medium">{transactionErrorMessage(error)}</p>
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
          <div className={isFetching ? 'opacity-70' : ''}>
            <div className="hidden md:block">
              <StatementTable items={items} page={page} limit={limit} />
            </div>
            <StatementCards items={items} page={page} limit={limit} />
            <div className="mt-4">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
