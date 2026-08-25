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
import { Modal } from '@/shared/components/ui/Modal';
import { formatCurrency, formatDate, cn } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { asPerson, fetchAllPages, personCsvCells } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { PersonDetails } from '@/shared/components/PersonDetails';
import { SplitPaymentsTab } from '../components/SplitPaymentsTab';
import { RedemptionsTab } from '../components/RedemptionsTab';
import { AssignPayerModal } from '../components/AssignPayerModal';
import type { Withdrawal } from '@/shared/types/api.types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
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

type Tab = 'pending' | 'all' | 'split' | 'redemptions';

type WithdrawalRow = Withdrawal & { paidAmount?: number; remainingAmount?: number };

export function WithdrawalsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [payTarget, setPayTarget] = useState<WithdrawalRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payUtr, setPayUtr] = useState('');
  const [markPaidTarget, setMarkPaidTarget] = useState<WithdrawalRow | null>(null);
  const [markPaidUtr, setMarkPaidUtr] = useState('');
  const [actionError, setActionError] = useState('');
  const [detail, setDetail] = useState<WithdrawalRow | null>(null);
  const [assignTarget, setAssignTarget] = useState<WithdrawalRow | null>(null);
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
    enabled: tab !== 'split' && tab !== 'redemptions',
  });

  const { data: detailFull, isLoading: detailLoading } = useQuery({
    queryKey: ['withdrawal-admin', detail?._id],
    queryFn: () => withdrawalsApi.getById(detail!._id),
    enabled: !!detail?._id,
  });
  const detailView = detailFull ?? detail;

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

  const assignPayer = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) =>
      withdrawalsApi.assignPayer(id, assigneeId),
    onSuccess: () => {
      setAssignTarget(null);
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['withdrawal-admin'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Assign failed')),
  });

  const unassignPayer = useMutation({
    mutationFn: (id: string) => withdrawalsApi.unassignPayer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['withdrawal-admin'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Unassign failed')),
  });

  const markPaid = useMutation({
    mutationFn: ({ id, utr }: { id: string; utr: string }) =>
      withdrawalsApi.approve(id, utr),
    onSuccess: () => {
      setMarkPaidTarget(null);
      setMarkPaidUtr('');
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Mark paid failed')),
  });

  const payAsAdmin = useMutation({
    mutationFn: ({ id, amount, utr }: { id: string; amount: number; utr: string }) =>
      withdrawalsApi.payAsAdmin(id, { amount, utr }),
    onSuccess: () => {
      setPayTarget(null);
      setPayAmount('');
      setPayUtr('');
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Admin pay failed')),
  });

  const items = (data?.items ?? []) as WithdrawalRow[];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pendingOnPage = items.filter((w) => w.status === 'pending').length;

  function p2pListLabel(w: WithdrawalRow) {
    const s = w.p2pListStatus || 'awaiting';
    if (w.origin === 'business' && s === 'awaiting') return 'Waiting admin verify';
    if (w.origin === 'business' && s === 'listed') return 'On pay list';
    if (s === 'listed') return 'Approved';
    if (s === 'rejected') return 'Approval rejected';
    return 'Awaiting Platform Payment';
  }

  function assigneeName(w: WithdrawalRow) {
    return asPerson(w.assignedTo)?.name || asPerson(w.assignedTo)?.email || '';
  }

  function showP2pListChip(w: WithdrawalRow) {
    const remaining =
      w.remainingAmount != null
        ? w.remainingAmount
        : Math.max(0, w.amount - (w.paidAmount || 0));
    if (['completed', 'cancelled', 'rejected', 'failed'].includes(w.status)) return false;
    if (remaining <= 0) return false;
    return w.status === 'pending' || w.status === 'processing';
  }

  function destinationLines(w: WithdrawalRow): string[] {
    if (w.method === 'upi' && w.upiDetails?.upiId) {
      return [
        `UPI: ${w.upiDetails.upiId}`,
        w.upiDetails.payerName ? `Name: ${w.upiDetails.payerName}` : '',
      ].filter(Boolean);
    }
    if (w.method === 'bank' && w.bankDetails) {
      const b = w.bankDetails;
      return [
        b.accountHolderName ? `Name: ${b.accountHolderName}` : '',
        b.accountNumber ? `Account: ${b.accountNumber}` : '',
        b.ifscCode ? `IFSC: ${b.ifscCode}` : '',
        b.bankName ? `Bank: ${b.bankName}` : '',
      ].filter(Boolean);
    }
    if (w.method === 'usdt' && w.usdtDetails?.walletAddress) {
      return [
        `Wallet: ${w.usdtDetails.walletAddress}`,
        w.usdtDetails.network ? `Network: ${w.usdtDetails.network}` : '',
      ].filter(Boolean);
    }
    return [];
  }

  function methodIcon(method: string) {
    switch (method) {
      case 'upi':
        return 'qr_code_2';
      case 'bank':
        return 'account_balance';
      case 'usdt':
        return 'currency_bitcoin';
      default:
        return 'payments';
    }
  }

  function statusAccent(status: string) {
    switch (status) {
      case 'pending':
        return 'border-l-amber-500';
      case 'processing':
        return 'border-l-sky-500';
      case 'completed':
        return 'border-l-emerald-500';
      case 'rejected':
      case 'cancelled':
      case 'failed':
        return 'border-l-red-500';
      default:
        return 'border-l-outline-variant';
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-low/50 to-secondary-container/20 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-secondary/10 blur-2xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
              <span className="material-symbols-outlined text-sm">north_east</span>
              Withdrawals
            </p>
            <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
              Withdrawal requests
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
              All requests — listed, awaiting, cancelled, and completed. Filter by status anytime.
            </p>
          </div>
          {tab !== 'split' && tab !== 'redemptions' ? (
            <CsvDownloadButton<WithdrawalRow>
              title="Withdrawals"
              filename={`withdrawals-${tab}`}
              filters={{ Tab: tab, Status: status, Method: method, Search: search, Sort: sort }}
              disabled={!total}
              columns={[
                { header: 'Reference', value: (w) => w.referenceId },
                { header: 'Status', value: (w) => w.status },
                { header: 'Method', value: (w) => w.method },
                { header: 'Amount', value: (w) => w.amount },
                { header: 'Currency', value: (w) => w.currency },
                { header: 'Paid', value: (w) => w.paidAmount ?? 0 },
                { header: 'User name', value: (w) => personCsvCells(w.userId)[0] },
                { header: 'User email', value: (w) => personCsvCells(w.userId)[1] },
                { header: 'User phone', value: (w) => personCsvCells(w.userId)[2] },
                { header: 'User role', value: (w) => personCsvCells(w.userId)[3] },
                { header: 'List status', value: (w) => w.p2pListStatus || '' },
                { header: 'Assigned to', value: (w) => personCsvCells(w.assignedTo)[0] },
                {
                  header: 'Payers',
                  value: (w) =>
                    (w.payments ?? [])
                      .map((p) => {
                        const payer = asPerson(p.payerUserId);
                        return [payer?.name, payer?.role, payer?.email].filter(Boolean).join(' ');
                      })
                      .filter(Boolean)
                      .join(' | '),
                },
                { header: 'Created', value: (w) => w.createdAt },
              ]}
              fetchRows={() =>
                fetchAllPages((p, l) =>
                  tab === 'pending'
                    ? withdrawalsApi.getPending({ ...listQuery, page: p, limit: l })
                    : withdrawalsApi.getAll({ ...listQuery, page: p, limit: l }),
                )
              }
            />
          ) : null}
        </div>
      </div>

      <div className="chip-scroll">
        {(['pending', 'all', 'split', 'redemptions'] as const).map((t) => (
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
            {t === 'split' ? 'Split Payments' : t === 'redemptions' ? 'Redemptions' : t}
          </button>
        ))}
      </div>

      {tab === 'split' ? (
        <SplitPaymentsTab />
      ) : tab === 'redemptions' ? (
        <RedemptionsTab />
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
                <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
                  {items.map((w) => {
                    const person = asPerson(w.userId);
                    const remaining = Math.max(0, w.amount - (w.paidAmount || 0));
                    return (
                      <article
                        key={w._id}
                        className={cn(
                          'overflow-hidden rounded-2xl border border-outline-variant/80 border-l-4 bg-surface-container-lowest shadow-sm transition hover:border-secondary/35 hover:shadow-md',
                          statusAccent(w.status),
                        )}
                      >
                        <div className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-stretch lg:justify-between">
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="flex flex-wrap items-start gap-2.5">
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <span className="material-symbols-outlined text-[22px]">
                                  {methodIcon(w.method)}
                                </span>
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-mono text-sm font-bold tracking-tight text-primary sm:text-base">
                                  {w.referenceId}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-on-surface-variant">
                                  <span className="font-semibold uppercase">{w.method}</span>
                                  <span>·</span>
                                  <span>{formatDate(w.createdAt)}</span>
                                  {w.paidAmount ? (
                                    <>
                                      <span>·</span>
                                      <span className="text-secondary">
                                        Paid {formatCurrency(w.paidAmount, w.currency)}
                                      </span>
                                    </>
                                  ) : null}
                                </p>
                              </div>
                            </div>

                            <div className="grid gap-2 rounded-xl border border-outline-variant/70 bg-surface-container-low/40 px-3 py-2.5 text-xs sm:grid-cols-2">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                                  User
                                </p>
                                <p className="mt-0.5 font-medium text-on-surface">
                                  {person?.name || '—'}
                                  {person?.role ? (
                                    <span className="font-normal text-on-surface-variant">
                                      {' '}
                                      · {person.role}
                                    </span>
                                  ) : null}
                                </p>
                                {person?.email ? (
                                  <p className="truncate text-on-surface-variant">{person.email}</p>
                                ) : null}
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                                  Destination
                                </p>
                                <p className="mt-0.5 text-on-surface">
                                  {destinationLines(w).join(' · ') || '—'}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={w.status} />
                              {w.priority ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                  Highlighted
                                </span>
                              ) : null}
                              {w.origin === 'business' ? (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  Business req
                                </span>
                              ) : null}
                              {showP2pListChip(w) ? (
                                <span
                                  className={cn(
                                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                    (w.p2pListStatus || 'awaiting') === 'listed'
                                      ? 'bg-secondary/15 text-secondary'
                                      : (w.p2pListStatus || 'awaiting') === 'rejected'
                                        ? 'bg-error/10 text-error'
                                        : 'bg-outline-variant/40 text-on-surface-variant',
                                  )}
                                >
                                  {p2pListLabel(w)}
                                </span>
                              ) : null}
                              {assigneeName(w) ? (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  Assigned: {assigneeName(w)}
                                </span>
                              ) : null}
                              {remaining > 0 && (w.paidAmount || 0) > 0 ? (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Left {formatCurrency(remaining, w.currency)}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col gap-3 border-t border-outline-variant/60 pt-3 lg:w-[220px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                            <div className="text-left lg:text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                                Amount
                              </p>
                              <p className="text-xl font-bold tabular-nums text-error sm:text-2xl">
                                {formatCurrency(w.amount, w.currency)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <Button size="sm" variant="secondary" onClick={() => setDetail(w)}>
                                Details
                              </Button>
                              {(w.status === 'pending' || w.status === 'processing') &&
                                (w.p2pListStatus || 'awaiting') !== 'listed' && (
                                  <Button
                                    size="sm"
                                    loading={listForP2p.isPending}
                                    onClick={() => listForP2p.mutate(w._id)}
                                  >
                                    {w.origin === 'business' ? 'Verify' : 'Approve'}
                                  </Button>
                                )}
                              {(w.status === 'pending' || w.status === 'processing') &&
                                w.p2pListStatus === 'listed' && (
                                  <>
                                    {w.origin === 'business' ? (
                                      <>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setPayTarget(w);
                                            setPayAmount(
                                              String(w.amount - (w.paidAmount || 0)),
                                            );
                                            setPayUtr('');
                                            setActionError('');
                                          }}
                                        >
                                          Pay
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => {
                                            setMarkPaidTarget(w);
                                            setMarkPaidUtr('');
                                            setActionError('');
                                          }}
                                        >
                                          Mark paid
                                        </Button>
                                      </>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      loading={unlistForP2p.isPending}
                                      onClick={() => unlistForP2p.mutate(w._id)}
                                    >
                                      Unlist
                                    </Button>
                                  </>
                                )}
                              {(w.status === 'pending' || w.status === 'processing') &&
                              Math.max(0, w.amount - (w.paidAmount || 0)) > 0 ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setAssignTarget(w);
                                    setActionError('');
                                  }}
                                >
                                  {assigneeName(w) ? 'Reassign' : 'Assign'}
                                </Button>
                              ) : null}
                              {assigneeName(w) &&
                              (w.status === 'pending' || w.status === 'processing') ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  loading={unassignPayer.isPending}
                                  onClick={() => unassignPayer.mutate(w._id)}
                                >
                                  Unassign
                                </Button>
                              ) : null}
                            </div>
                            {w.status === 'pending' && (w.paidAmount || 0) > 0 && (
                              <p className="text-[11px] text-on-surface-variant lg:text-right">
                                Use Split Payments to approve proofs
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
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

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Withdrawal details" className="sm:max-w-2xl">
        {detailLoading && !detailView ? (
          <LoadingScreen />
        ) : detailView ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-on-surface-variant">Reference:</span>{' '}
              <span className="font-semibold">{detailView.referenceId}</span>
            </p>
            <p>
              <span className="text-on-surface-variant">Amount:</span>{' '}
              <span className="font-semibold">
                {formatCurrency(detailView.amount, detailView.currency)}
              </span>
              {detailView.paidAmount ? (
                <span className="text-on-surface-variant">
                  {' '}
                  · Paid {formatCurrency(detailView.paidAmount, detailView.currency)}
                </span>
              ) : null}
            </p>
            <p>
              <span className="text-on-surface-variant">Method:</span>{' '}
              {detailView.method.toUpperCase()}
            </p>
            <p>
              <span className="text-on-surface-variant">Status:</span>{' '}
              <StatusBadge status={detailView.status} />
            </p>

            <PersonDetails title="Withdrawer (user)" person={detailView.userId} />
            {detailView.assignedTo ? (
              <PersonDetails title="Assigned payer" person={detailView.assignedTo} />
            ) : null}

            {typeof detailView.businessId === 'object' && detailView.businessId?.name ? (
              <div className="rounded-lg border border-outline-variant p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-on-surface-variant">
                  Business
                </p>
                <p className="font-medium">{detailView.businessId.name}</p>
                {detailView.businessId.referralCode ? (
                  <p className="text-xs text-on-surface-variant">
                    Code: {detailView.businessId.referralCode}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-outline-variant p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-on-surface-variant">
                Destination
              </p>
              {destinationLines(detailView).length ? (
                destinationLines(detailView).map((line) => (
                  <p key={line} className="font-medium">
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-on-surface-variant">No destination details</p>
              )}
              {detailView.upiDetails?.utr ? (
                <p className="font-medium">UTR: {detailView.upiDetails.utr}</p>
              ) : null}
              {detailView.bankDetails?.utr ? (
                <p className="font-medium">UTR: {detailView.bankDetails.utr}</p>
              ) : null}
              {detailView.usdtDetails?.txHash ? (
                <p className="break-all font-medium">Tx hash: {detailView.usdtDetails.txHash}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-on-surface-variant">
                Payers ({detailView.payments?.length ?? 0})
              </p>
              {!detailView.payments?.length ? (
                <p className="rounded-lg border border-outline-variant p-3 text-on-surface-variant">
                  No split payments yet
                </p>
              ) : (
                detailView.payments.map((p) => (
                  <div key={p._id} className="rounded-lg border border-outline-variant p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {formatCurrency(p.amount, p.currency || detailView.currency)}
                      </p>
                      <StatusBadge status={p.status} />
                    </div>
                    <PersonDetails title="Payer" person={p.payerUserId} compact />
                    {p.utr ? (
                      <p className="mt-1 text-xs">
                        <span className="text-on-surface-variant">UTR:</span> {p.utr}
                      </p>
                    ) : null}
                    {p.referenceId ? (
                      <p className="text-xs text-on-surface-variant">{p.referenceId}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title="Admin pay"
        className="sm:max-w-md"
      >
        {payTarget ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              Pay {formatCurrency(payTarget.amount, payTarget.currency)} to this business
              withdrawal. UTR required; proof optional for admin.
            </p>
            <Input
              label="Amount"
              type="number"
              min={1}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            <Input
              label="UTR / TxID"
              value={payUtr}
              onChange={(e) => setPayUtr(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayTarget(null)}>
                Cancel
              </Button>
              <Button
                loading={payAsAdmin.isPending}
                onClick={() => {
                  const amt = Number(payAmount);
                  if (!amt || !payUtr.trim()) {
                    setActionError('Amount and UTR are required');
                    return;
                  }
                  payAsAdmin.mutate({ id: payTarget._id, amount: amt, utr: payUtr.trim() });
                }}
              >
                Submit pay
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!markPaidTarget}
        onClose={() => setMarkPaidTarget(null)}
        title="Mark paid"
        className="sm:max-w-md"
      >
        {markPaidTarget ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              Completes this business withdrawal after you already paid the destination.
            </p>
            <Input
              label="UTR / TxID"
              value={markPaidUtr}
              onChange={(e) => setMarkPaidUtr(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMarkPaidTarget(null)}>
                Cancel
              </Button>
              <Button
                loading={markPaid.isPending}
                onClick={() => {
                  if (!markPaidUtr.trim()) {
                    setActionError('UTR is required');
                    return;
                  }
                  markPaid.mutate({ id: markPaidTarget._id, utr: markPaidUtr.trim() });
                }}
              >
                Confirm paid
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <AssignPayerModal
        open={!!assignTarget}
        withdrawal={assignTarget}
        loading={assignPayer.isPending}
        error={actionError}
        onClose={() => setAssignTarget(null)}
        onAssign={(assigneeId) => assignPayer.mutate({ id: assignTarget!._id, assigneeId })}
      />
    </div>
  );
}
