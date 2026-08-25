'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { Card } from '@/shared/components/ui/Card';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { apiErrorMessage, cn, formatCurrency } from '@/shared/lib/utils';
import {
  StatementCards,
  StatementTable,
} from '../components/ledger-ui';

const PAGE_SIZES = [10, 20, 50];

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'investment', label: 'Investment' },
  { value: 'redemption', label: 'Redemption' },
  { value: 'commission', label: 'Bonus' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'lock', label: 'Lock' },
  { value: 'unlock', label: 'Unlock' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

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
    queryFn: () => transactionsApi.getAll(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const available = balance?.availableBalance ?? 0;
  const currency = items[0]?.currency || 'INR';

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          Investor statement
        </p>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
          Combined ledger
        </h1>
        <p className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">
          {formatCurrency(available, currency)}
        </p>
      </div>

      <Card>
        <div className="mb-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Input
                label="Search"
                icon="search"
                placeholder="Remark, reference…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:w-[280px]">
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setType(t.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold',
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
            <p className="text-sm font-medium">
              {apiErrorMessage(error, 'Could not load transactions')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || type !== 'all' ? 'No transactions match your filters' : 'No transactions yet'
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
