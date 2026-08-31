'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { p2pPayApi, type P2pPayment } from '../api/p2p-pay.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { liveQueryOptions } from '@/shared/constants/live-query';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) return msg.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function MyDepositsPageInner() {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get('status');
  const initialStatus =
    statusFromUrl && STATUS_FILTERS.some((f) => f.value === statusFromUrl)
      ? statusFromUrl
      : 'all';

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setStatus(initialStatus);
    setPage(1);
  }, [initialStatus]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status, sort, limit]);

  const listQuery = useMemo(
    () => ({ page, limit, status, search, sort }),
    [page, limit, status, search, sort],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['my-deposits-platform', listQuery],
    queryFn: () => p2pPayApi.getMyPayments(listQuery),
    ...liveQueryOptions,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const pendingCount = items.filter(
    (i) => i.status === 'pending' || i.status === 'processing',
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
            My Deposits
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Platform Payments you have submitted to complete deposits
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CsvDownloadButton<P2pPayment>
            title="My deposits"
            filename="my-deposits"
            filters={{ Status: status, Search: search, Sort: sort }}
            disabled={!total}
            columns={[
              { header: 'Reference', value: (p) => p.referenceId },
              { header: 'Status', value: (p) => p.status },
              { header: 'Amount', value: (p) => p.amount },
              { header: 'Currency', value: (p) => p.currency },
              { header: 'Created', value: (p) => p.createdAt },
            ]}
            fetchRows={() =>
              fetchAllPages((page, limit) =>
                p2pPayApi.getMyPayments({ ...listQuery, page, limit }),
              )
            }
          />
          <Link href="/deposits">
            <Button size="sm">Make a deposit</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Total
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{total}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Completed (page)
          </p>
          <p className="mt-1 text-lg font-bold text-emerald-700 sm:mt-2 sm:text-2xl">
            {completedCount}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Open (page)
          </p>
          <p className="mt-1 text-lg font-bold text-amber-700 sm:mt-2 sm:text-2xl">
            {pendingCount}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  status === f.value
                    ? 'border-secondary bg-secondary-container text-on-secondary-container'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                label="Search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Reference, UTR…"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:w-72">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-on-surface-variant">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-on-surface-variant">Per page</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
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
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
            <p className="text-sm">{errorMessage(error, 'Could not load deposits')}</p>
            <Button type="button" className="mt-3" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all'
                ? 'No deposits match your filters'
                : 'No deposits yet'
            }
            icon="south_west"
          />
        ) : (
          <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((p) => (
              <PlatformDepositRow key={p._id} payment={p} />
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function PlatformDepositRow({ payment }: { payment: P2pPayment }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{formatCurrency(payment.amount, payment.currency)}</p>
          <StatusBadge status={payment.status} />
        </div>
        <p className="mt-1 break-all text-xs text-on-surface-variant">
          {payment.referenceId}
          {payment.utr ? ` · UTR ${payment.utr}` : ''}
          {' · '}
          {formatDate(payment.createdAt)}
        </p>
        {payment.netCreditedAmount != null && payment.status === 'completed' && (
          <p className="mt-0.5 text-xs text-secondary">
            Credited {formatCurrency(payment.netCreditedAmount)}
          </p>
        )}
        {payment.rejectionReason && (
          <p className="mt-0.5 text-xs text-error">{payment.rejectionReason}</p>
        )}
        {payment.proofImageUrl && (
          <a
            href={payment.proofImageUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"
          >
            <span className="material-symbols-outlined text-sm">image</span>
            View proof
          </a>
        )}
      </div>
    </div>
  );
}

export function MyDepositsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MyDepositsPageInner />
    </Suspense>
  );
}
