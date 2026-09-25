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
import { adminDepositPayApi } from '@/features/deposits/api/admin-deposit-pay.api';
import type { Withdrawal } from '@/shared/types/api.types';
import { liveQueryOptions } from '@/shared/constants/live-query';

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
  const [markPaidTxHash, setMarkPaidTxHash] = useState('');
  const [markPaidProofKey, setMarkPaidProofKey] = useState('');
  const [markPaidProofUrl, setMarkPaidProofUrl] = useState('');
  const [markPaidProofUploading, setMarkPaidProofUploading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
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
    ...liveQueryOptions,
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

  const setPriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: boolean }) =>
      withdrawalsApi.setPriority(id, priority),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['withdrawal-admin'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Highlight failed')),
  });

  const markPaid = useMutation({
    mutationFn: ({
      id,
      utr,
      txHash,
      proofImageKey,
      proofImageUrl,
    }: {
      id: string;
      utr?: string;
      txHash?: string;
      proofImageKey?: string;
      proofImageUrl?: string;
    }) =>
      withdrawalsApi.approve(id, {
        utr,
        txHash,
        proofImageKey,
        proofImageUrl,
      }),
    onSuccess: () => {
      setMarkPaidTarget(null);
      setMarkPaidUtr('');
      setMarkPaidTxHash('');
      setMarkPaidProofKey('');
      setMarkPaidProofUrl('');
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Mark paid failed')),
  });

  const rejectWithdrawal = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      withdrawalsApi.reject(id, reason),
    onSuccess: () => {
      setRejectTarget(null);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Reject failed')),
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
    if (w.origin === 'business' && s === 'awaiting') return 'Needs verify';
    if (w.origin === 'business' && s === 'listed') return 'On pay list';
    if (s === 'listed') return 'Approved';
    if (s === 'over_limit') return 'Over limit';
    if (s === 'rejected') return 'Rejected';
    return 'Awaiting';
  }

  function destinationShort(w: WithdrawalRow): string {
    if (w.method === 'upi' && w.upiDetails?.upiId) {
      const name = w.upiDetails.payerName?.trim();
      return name ? `${name} · ${w.upiDetails.upiId}` : w.upiDetails.upiId;
    }
    if (w.method === 'bank') {
      const acct = w.bankDetails?.accountNumber ?? '';
      if (!acct) return '';
      const b = w.bankDetails!;
      return [b.accountHolderName, `****${acct.slice(-4)}`, b.ifscCode]
        .filter(Boolean)
        .join(' · ');
    }
    if (w.method === 'usdt' && w.usdtDetails?.walletAddress) {
      const a = w.usdtDetails.walletAddress;
      return `${a.slice(0, 8)}…${a.slice(-4)}${w.usdtDetails.network ? ` · ${w.usdtDetails.network}` : ''}`;
    }
    if (w.method === 'cdm') {
      return w.cdmDetails?.payerName || 'CDM';
    }
    return '';
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
    if (w.method === 'cdm') {
      return [
        w.cdmDetails?.payerName ? `Depositor: ${w.cdmDetails.payerName}` : 'CDM',
        w.cdmDetails?.locationHint ? `Location: ${w.cdmDetails.locationHint}` : '',
        w.cdmDetails?.notes ? `Notes: ${w.cdmDetails.notes}` : '',
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
      case 'cdm':
        return 'atm';
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
            {t === 'split'
              ? 'Partial payments'
              : t === 'redemptions'
                ? 'Redemptions'
                : t}
          </button>
        ))}
      </div>

      {tab === 'split' ? (
        <SplitPaymentsTab defaultPayType="partial" />
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
                <div className={`space-y-1.5 ${isFetching ? 'opacity-70' : ''}`}>
                  {items.map((w) => {
                    const person = asPerson(w.userId);
                    const biz =
                      typeof w.businessId === 'object' && w.businessId
                        ? w.businessId
                        : null;
                    const remaining = Math.max(0, w.amount - (w.paidAmount || 0));
                    const dest = destinationShort(w);
                    const canManage =
                      w.status === 'pending' || w.status === 'processing';
                    const listStatus = w.p2pListStatus || 'awaiting';
                    const notListed = listStatus !== 'listed';
                    const hasRemaining = remaining > 0;
                    const btn =
                      '!h-7 !min-h-0 !px-2 !py-0 text-[11px] font-semibold';

                    return (
                      <article
                        key={w._id}
                        className={cn(
                          'overflow-hidden rounded-lg border border-outline-variant/80 border-l-[3px] bg-surface-container-lowest',
                          statusAccent(w.status),
                        )}
                      >
                        <div className="flex items-start gap-2 px-2 py-1.5 sm:items-center sm:px-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="material-symbols-outlined text-[14px] text-primary">
                                {methodIcon(w.method)}
                              </span>
                              <span className="text-[13px] font-bold tabular-nums text-error">
                                {formatCurrency(w.amount, w.currency)}
                              </span>
                              <StatusBadge status={w.status} />
                              {w.priority ? (
                                <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-bold uppercase text-amber-900">
                                  Highlighted
                                </span>
                              ) : null}
                              {w.origin === 'business' ? (
                                <span className="rounded bg-primary/10 px-1 py-px text-[9px] font-semibold text-primary">
                                  Business req
                                </span>
                              ) : null}
                              {showP2pListChip(w) ? (
                                <span
                                  className={cn(
                                    'rounded px-1 py-px text-[9px] font-semibold',
                                    listStatus === 'listed'
                                      ? 'bg-secondary/15 text-secondary'
                                      : listStatus === 'rejected'
                                        ? 'bg-error/10 text-error'
                                        : listStatus === 'over_limit'
                                          ? 'bg-amber-500/15 text-amber-900'
                                          : 'bg-outline-variant/40 text-on-surface-variant',
                                  )}
                                >
                                  {p2pListLabel(w)}
                                </span>
                              ) : null}
                              {(w.paidAmount || 0) > 0 ? (
                                <span className="text-[10px] text-secondary">
                                  · Paid {formatCurrency(w.paidAmount || 0, w.currency)}
                                  {hasRemaining
                                    ? ` · Left ${formatCurrency(remaining, w.currency)}`
                                    : ''}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0 text-[10px] leading-snug text-on-surface-variant">
                              <span className="truncate font-mono font-medium text-primary">
                                {w.referenceId}
                              </span>
                              <span aria-hidden>·</span>
                              <span className="uppercase">{w.method}</span>
                              <span aria-hidden>·</span>
                              <span>{formatDate(w.createdAt)}</span>
                            </div>

                            <div className="mt-1 rounded-md border border-outline-variant/60 bg-surface-container-low/50 px-2 py-1 text-[11px] leading-snug">
                              {biz?.name ? (
                                <p className="truncate font-semibold text-on-surface">
                                  {biz.name}
                                  {biz.referralCode ? (
                                    <span className="ml-1 font-normal text-on-surface-variant">
                                      · {biz.referralCode}
                                    </span>
                                  ) : null}
                                </p>
                              ) : null}
                              {(person?.name || person?.email) && (
                                <p className="truncate text-on-surface-variant">
                                  {person?.name || '—'}
                                  {person?.role ? ` · ${person.role}` : ''}
                                  {person?.email ? ` · ${person.email}` : ''}
                                </p>
                              )}
                              {dest ? (
                                <p className="truncate text-on-surface">{dest}</p>
                              ) : null}
                              {assigneeName(w) ? (
                                <p className="truncate text-primary">
                                  Assigned → {assigneeName(w)}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                            {canManage && notListed ? (
                              <Button
                                size="sm"
                                className={btn}
                                loading={listForP2p.isPending}
                                onClick={() => listForP2p.mutate(w._id)}
                              >
                                {w.origin === 'business'
                                  ? 'Verify'
                                  : listStatus === 'over_limit'
                                    ? 'Approve OL'
                                    : 'Approve'}
                              </Button>
                            ) : null}
                            {canManage && hasRemaining ? (
                              <Button
                                size="sm"
                                variant="danger"
                                className={btn}
                                onClick={() => {
                                  setRejectTarget(w);
                                  setRejectReason('');
                                  setActionError('');
                                }}
                              >
                                {(w.paidAmount || 0) > 0 ? 'Reject rem.' : 'Reject'}
                              </Button>
                            ) : null}
                            {canManage && listStatus === 'listed' ? (
                              <>
                                {w.origin === 'business' ? (
                                  <>
                                    <Button
                                      size="sm"
                                      className={btn}
                                      onClick={() => {
                                        setPayTarget(w);
                                        setPayAmount(String(remaining));
                                        setPayUtr('');
                                        setActionError('');
                                      }}
                                    >
                                      Pay
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className={btn}
                                      onClick={() => {
                                        setMarkPaidTarget(w);
                                        setMarkPaidUtr('');
                                        setMarkPaidTxHash('');
                                        setMarkPaidProofKey('');
                                        setMarkPaidProofUrl('');
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
                                  className={btn}
                                  loading={unlistForP2p.isPending}
                                  onClick={() => unlistForP2p.mutate(w._id)}
                                >
                                  Unlist
                                </Button>
                              </>
                            ) : null}
                            {canManage && hasRemaining ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className={btn}
                                onClick={() => {
                                  setAssignTarget(w);
                                  setActionError('');
                                }}
                              >
                                {assigneeName(w) ? 'Reassign' : 'Assign'}
                              </Button>
                            ) : null}
                            {assigneeName(w) && canManage ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className={btn}
                                loading={unassignPayer.isPending}
                                onClick={() => unassignPayer.mutate(w._id)}
                              >
                                Unassign
                              </Button>
                            ) : null}
                            {canManage && hasRemaining ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className={btn}
                                loading={setPriority.isPending}
                                onClick={() =>
                                  setPriority.mutate({
                                    id: w._id,
                                    priority: !w.priority,
                                  })
                                }
                              >
                                {w.priority ? 'Unhighlight' : 'Highlight'}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              className={btn}
                              onClick={() => setDetail(w)}
                            >
                              Details
                            </Button>
                          </div>
                        </div>
                        {w.status === 'pending' && (w.paidAmount || 0) > 0 ? (
                          <p className="border-t border-outline-variant/50 px-2 py-1 text-[10px] text-on-surface-variant sm:px-2.5">
                            Use Split Payments to approve proofs
                          </p>
                        ) : null}
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
        onClose={() => {
          if (markPaid.isPending || markPaidProofUploading) return;
          setMarkPaidTarget(null);
          setActionError('');
        }}
        title="Mark paid"
        className="sm:max-w-md"
      >
        {markPaidTarget ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const isUsdt = markPaidTarget.method === 'usdt';
              const ref = isUsdt ? markPaidTxHash.trim() : markPaidUtr.trim();
              if (!ref) {
                setActionError(isUsdt ? 'Tx Hash is required' : 'UTR is required');
                return;
              }
              markPaid.mutate({
                id: markPaidTarget._id,
                utr: isUsdt ? undefined : ref,
                txHash: isUsdt ? ref : undefined,
                proofImageKey: markPaidProofKey || undefined,
                proofImageUrl: markPaidProofUrl || undefined,
              });
            }}
          >
            <p className="text-sm text-on-surface-variant">
              Completes this business withdrawal after you already paid the destination.
            </p>
            {markPaidTarget.method === 'usdt' ? (
              <Input
                label="Tx Hash"
                value={markPaidTxHash}
                onChange={(e) => setMarkPaidTxHash(e.target.value)}
                placeholder="Tx hash"
                maxLength={66}
              />
            ) : (
              <Input
                label="UTR / RRN"
                value={markPaidUtr}
                onChange={(e) => setMarkPaidUtr(e.target.value)}
                placeholder="UTR / RRN"
                maxLength={22}
              />
            )}
            <div>
              <p className="mb-1 text-sm font-semibold">Payment evidence (optional)</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                className="block w-full text-sm"
                disabled={markPaidProofUploading || markPaid.isPending}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setMarkPaidProofUploading(true);
                  setActionError('');
                  try {
                    const uploaded = await adminDepositPayApi.uploadProof(
                      file,
                      'withdrawal-approve-proof',
                    );
                    setMarkPaidProofKey(uploaded.key);
                    setMarkPaidProofUrl(uploaded.publicUrl);
                  } catch (err) {
                    setMarkPaidProofKey('');
                    setMarkPaidProofUrl('');
                    setActionError(err instanceof Error ? err.message : 'Upload failed');
                  } finally {
                    setMarkPaidProofUploading(false);
                    e.target.value = '';
                  }
                }}
              />
              {markPaidProofUploading ? (
                <p className="mt-1 text-xs text-on-surface-variant">Uploading…</p>
              ) : null}
              {markPaidProofUrl ? (
                <a
                  href={markPaidProofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block truncate text-xs font-semibold text-secondary hover:underline"
                >
                  Evidence attached — view
                </a>
              ) : null}
            </div>
            {actionError ? (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {actionError}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMarkPaidTarget(null)}
                disabled={markPaid.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={markPaid.isPending || markPaidProofUploading}
              >
                Confirm paid
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          if (rejectWithdrawal.isPending) return;
          setRejectTarget(null);
          setActionError('');
        }}
        title="Reject withdrawal"
        className="sm:max-w-md"
      >
        {rejectTarget ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!rejectReason.trim()) {
                setActionError('Reject reason is required');
                return;
              }
              rejectWithdrawal.mutate({
                id: rejectTarget._id,
                reason: rejectReason.trim(),
              });
            }}
          >
            <p className="text-sm text-on-surface-variant">
              {(rejectTarget.paidAmount || 0) > 0 ? (
                <>
                  Confirmed pays stay. Remaining{' '}
                  <span className="font-semibold text-on-surface">
                    {formatCurrency(
                      Math.max(0, rejectTarget.amount - (rejectTarget.paidAmount || 0)),
                      rejectTarget.currency,
                    )}
                  </span>{' '}
                  is cancelled — unused pay-limit and fee refund to the business (fee also
                  deducted from admin).
                </>
              ) : (
                <>
                  Cancels request{' '}
                  <span className="font-mono font-semibold">{rejectTarget.referenceId}</span>{' '}
                  and unlocks the user wallet. This cannot be undone.
                </>
              )}
            </p>
            <Input
              label="Reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection"
              required
            />
            {actionError ? (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {actionError}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectTarget(null)}
                disabled={rejectWithdrawal.isPending}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={rejectWithdrawal.isPending}
              >
                Confirm reject
              </Button>
            </div>
          </form>
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
