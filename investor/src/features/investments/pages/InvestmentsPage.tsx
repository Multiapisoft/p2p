'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { investorApi } from '@/features/investor/api/investor.api';
import { Card } from '@/shared/components/ui/Card';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import type { PaymentMethod } from '@/shared/types/api.types';

const PAGE_SIZES = [5, 10, 20];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const METHOD_FILTERS: { value: PaymentMethod | 'all'; label: string }[] = [
  { value: 'all', label: 'All methods' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'status', label: 'Status' },
];

export function InvestmentsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
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
    () => ({ page, limit, status, search, sort, method }),
    [page, limit, status, search, sort, method],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['investments', listQuery],
    queryFn: () => investorApi.getInvestments(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold">My Investments</h1>
          <p className="text-on-surface-variant">Track all your investment requests</p>
        </div>
        <Link href="/invest">
          <Button>
            <span className="material-symbols-outlined text-lg">add</span>
            New
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Total results
          </p>
          <p className="mt-2 text-2xl font-bold">{total}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Matching filters</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            On this page
          </p>
          <p className="mt-2 text-2xl font-bold">{items.length}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Current page</p>
        </div>
      </div>

      <Card>
        <div className="mb-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Input
                label="Search"
                icon="search"
                placeholder="Reference ID, note…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-[420px]">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Sort
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Method
                <select
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value as PaymentMethod | 'all');
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  {METHOD_FILTERS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Per page
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
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

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  status === s.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
              {apiErrorMessage(error, 'Could not load investments')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all' || method !== 'all'
                ? 'No investments match your filters'
                : 'No investments yet'
            }
            icon="savings"
          />
        ) : (
          <>
            <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((inv) => (
                <div
                  key={inv._id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant p-4"
                >
                  <div>
                    <p className="font-semibold">{formatCurrency(inv.amount)}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {inv.referenceId} • {inv.method.toUpperCase()}
                    </p>
                    <p className="mt-1 text-xs text-outline">{formatDate(inv.createdAt)}</p>
                    {inv.failureReason && (
                      <p className="mt-1 text-xs text-error">Reason: {inv.failureReason}</p>
                    )}
                  </div>
                  <StatusBadge status={inv.status} />
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
