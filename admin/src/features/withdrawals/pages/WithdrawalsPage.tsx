'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withdrawalsApi } from '../api/withdrawals.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { SplitPaymentsTab } from '../components/SplitPaymentsTab';
import type { Withdrawal } from '@/shared/types/api.types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const METHOD_FILTERS = [
  { value: 'all', label: 'All methods' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount high–low' },
  { value: 'amount_asc', label: 'Amount low–high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

type Tab = 'pending' | 'all' | 'split';

type WithdrawalRow = Withdrawal & { paidAmount?: number };

export function WithdrawalsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({
      page,
      limit,
      search,
      status: tab === 'pending' ? 'pending' : status,
      sort,
      method,
    }),
    [page, limit, search, status, sort, method, tab],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['withdrawals', tab, listQuery],
    queryFn: () =>
      tab === 'pending'
        ? withdrawalsApi.getPending(listQuery)
        : withdrawalsApi.getAll(listQuery),
    enabled: tab !== 'split',
  });

  const listForP2p = useMutation({
    mutationFn: (id: string) => withdrawalsApi.listForP2p(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'List for Platform Payment failed')),
  });

  const unlistForP2p = useMutation({
    mutationFn: (id: string) => withdrawalsApi.unlistForP2p(id, 'Removed from Platform Payment list'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Unlist failed')),
  });

  const items = (data?.items ?? []) as WithdrawalRow[];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pendingOnPage = items.filter((w) => w.status === 'pending').length;

  function p2pListLabel(w: WithdrawalRow) {
    const s = w.p2pListStatus || 'awaiting';
    if (s === 'listed') return 'Platform Payment listed';
    if (s === 'rejected') return 'Platform Payment rejected';
    return 'Awaiting Platform Payment';
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
          Withdrawals
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          View withdrawals and manage Platform Payment listing. Final approve/reject is done by the
          owning business.
        </p>
      </div>

      <div className="chip-scroll">
        {(['pending', 'all', 'split'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition sm:px-4 sm:py-2 sm:text-sm ${
              tab === t ? 'bg-primary text-on-primary' : 'border border-outline-variant'
            }`}
          >
            {t === 'split' ? 'Split Payments' : t}
          </button>
        ))}
      </div>

      {tab === 'split' ? (
        <SplitPaymentsTab />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
                Total results
              </p>
              <p className="mt-1 text-lg font-bold sm:text-2xl">{total}</p>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
                On this page
              </p>
              <p className="mt-1 text-lg font-bold sm:text-2xl">{items.length}</p>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
                Pending on page
              </p>
              <p className="mt-1 text-lg font-bold sm:text-2xl">{pendingOnPage}</p>
            </div>
          </div>

          <Card>
            <div className="mb-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Input
                  className="min-w-0 flex-1 sm:min-w-[220px]"
                  placeholder="Search reference, UTR, user…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <select
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm sm:px-3 sm:py-2.5"
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
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm sm:px-3 sm:py-2.5"
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value);
                    setPage(1);
                  }}
                >
                  {METHOD_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm sm:px-3 sm:py-2.5"
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

              {tab === 'all' && (
                <div className="chip-scroll">
                  {STATUS_FILTERS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        setStatus(s.value);
                        setPage(1);
                      }}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition sm:px-3.5 sm:py-1.5 sm:text-xs ${
                        status === s.value
                          ? 'bg-primary text-on-primary'
                          : 'border border-outline-variant'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {actionError && (
                <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                  {actionError}
                </div>
              )}
            </div>

            {isLoading ? (
              <LoadingScreen />
            ) : !items.length ? (
              <EmptyState
                message={
                  search || (tab === 'all' && status !== 'all') || method !== 'all'
                    ? 'No withdrawals match your filters'
                    : 'No withdrawals found'
                }
                icon="north_east"
              />
            ) : (
              <>
                <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
                  {items.map((w) => (
                    <div
                      key={w._id}
                      className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3 sm:gap-3 sm:rounded-xl sm:p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{w.referenceId}</p>
                        <p className="text-xs text-on-surface-variant sm:text-sm">
                          {w.method.toUpperCase()} • {formatDate(w.createdAt)}
                          {w.paidAmount ? (
                            <> • Paid: {formatCurrency(w.paidAmount)}</>
                          ) : null}
                          {(w.commissionAmount || 0) > 0 ? (
                            <>
                              {' '}
                              • Commission −{formatCurrency(w.commissionAmount!, w.currency)}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
                        <div className="text-left sm:text-right">
                          <p className="text-base font-bold text-error sm:text-lg">
                            {formatCurrency(w.amount, w.currency)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:justify-end">
                            <StatusBadge status={w.status} />
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                (w.p2pListStatus || 'awaiting') === 'listed'
                                  ? 'bg-secondary/15 text-secondary'
                                  : (w.p2pListStatus || 'awaiting') === 'rejected'
                                    ? 'bg-error/10 text-error'
                                    : 'bg-outline-variant/40 text-on-surface-variant'
                              }`}
                            >
                              {p2pListLabel(w)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {(w.status === 'pending' || w.status === 'processing') &&
                            (w.p2pListStatus || 'awaiting') !== 'listed' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={listForP2p.isPending}
                                onClick={() => listForP2p.mutate(w._id)}
                              >
                                List for Platform Payment
                              </Button>
                            )}
                          {(w.status === 'pending' || w.status === 'processing') &&
                            w.p2pListStatus === 'listed' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={unlistForP2p.isPending}
                                onClick={() => unlistForP2p.mutate(w._id)}
                              >
                                Unlist Platform Payment
                              </Button>
                            )}
                          {w.status === 'pending' && (w.paidAmount || 0) > 0 && (
                            <p className="text-[11px] text-on-surface-variant">
                              Use Split Payments to approve proofs
                            </p>
                          )}
                        </div>
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
        </>
      )}
    </div>
  );
}
