'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  adminDepositPayApi,
  type BusinessDepositPayment,
} from '@/features/deposits/api/admin-deposit-pay.api';
import { AdminDepositPayPanel } from '@/features/deposits/components/AdminDepositPayPanel';
import { AdminNewWithdrawalPopup } from '@/features/deposits/components/AdminNewWithdrawalPopup';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { formatCurrency, formatDate } from '@/shared/lib/utils';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount high–low' },
  { value: 'amount_asc', label: 'Amount low–high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

function MyPaymentsHistory() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
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

  useEffect(() => {
    setPage(1);
  }, [status, sort, limit]);

  const listQuery = useMemo(
    () => ({ page, limit, status, search, sort }),
    [page, limit, status, search, sort],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-my-deposits', listQuery],
    queryFn: () => adminDepositPayApi.getMyPayments(listQuery),
    refetchInterval: 10_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const pendingCount = items.filter(
    (i) => i.status === 'pending' || i.status === 'processing',
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Total
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{total}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Completed (page)
          </p>
          <p className="mt-1 text-lg font-bold text-emerald-700 sm:text-2xl">{completedCount}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Open (page)
          </p>
          <p className="mt-1 text-lg font-bold text-amber-700 sm:text-2xl">{pendingCount}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <CsvDownloadButton<BusinessDepositPayment>
              title="My deposits"
              filename="admin-my-deposits"
              filters={{ Status: status, Search: search, Sort: sort }}
              disabled={!total}
              columns={[
                { header: 'Reference', value: (p) => p.referenceId },
                { header: 'Status', value: (p) => p.status },
                { header: 'Amount', value: (p) => p.amount },
                { header: 'Currency', value: (p) => p.currency },
                { header: 'UTR', value: (p) => p.utr || '' },
                { header: 'Created', value: (p) => p.createdAt },
              ]}
              fetchRows={() =>
                fetchAllPages((p, l) =>
                  adminDepositPayApi.getMyPayments({ ...listQuery, page: p, limit: l }),
                )
              }
            />
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
            <p className="text-sm">{getApiErrorMessage(error, 'Could not load deposits')}</p>
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
              <div
                key={p._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant p-3 sm:p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{formatCurrency(p.amount, p.currency)}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 break-all text-xs text-on-surface-variant">
                    {p.referenceId}
                    {p.utr ? ` · UTR ${p.utr}` : ''}
                    {' · '}
                    {formatDate(p.createdAt)}
                  </p>
                  {p.netCreditedAmount != null && p.status === 'completed' && (
                    <p className="mt-0.5 text-xs text-secondary">
                      Credited {formatCurrency(p.netCreditedAmount)}
                    </p>
                  )}
                  {p.rejectionReason && (
                    <p className="mt-0.5 text-xs text-error">{p.rejectionReason}</p>
                  )}
                  {p.proofImageUrl && (
                    <a
                      href={p.proofImageUrl}
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

export function MyDepositsPage() {
  const [tab, setTab] = useState<'pay' | 'history'>('pay');

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <AdminNewWithdrawalPopup />
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
          My Deposits
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Pay listed withdrawals to credit your wallet, and review your payment history
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('pay')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'pay'
              ? 'bg-primary text-on-primary'
              : 'border border-outline-variant bg-surface-container-lowest'
          }`}
        >
          Make deposit
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'history'
              ? 'bg-primary text-on-primary'
              : 'border border-outline-variant bg-surface-container-lowest'
          }`}
        >
          History
        </button>
      </div>

      {tab === 'pay' ? <AdminDepositPayPanel /> : <MyPaymentsHistory />}
    </div>
  );
}
