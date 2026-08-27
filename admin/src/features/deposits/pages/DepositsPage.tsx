'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { depositsApi } from '../api/deposits.api';
import { withdrawalPaymentsApi } from '@/features/withdrawals/api/withdrawal-payments.api';
import { SplitPaymentsTab } from '@/features/withdrawals/components/SplitPaymentsTab';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { cn, formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { normalizeUtr, normalizeTxHash, txHashError, utrError } from '@/shared/lib/validation';
import { asPerson, fetchAllPages, personCsvCells } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { PersonDetails } from '@/shared/components/PersonDetails';
import { InvestmentsTab } from '../components/InvestmentsTab';
import { AdminNewWithdrawalPopup } from '../components/AdminNewWithdrawalPopup';
import { AdminDepositPayPanel } from '../components/AdminDepositPayPanel';
import type { Deposit } from '@/shared/types/api.types';

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
  { value: 'cdm', label: 'CDM' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount high–low' },
  { value: 'amount_asc', label: 'Amount low–high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [10, 20, 50];

function methodIcon(method: string) {
  if (method === 'upi') return 'qr_code';
  if (method === 'usdt') return 'currency_bitcoin';
  if (method === 'cdm') return 'atm';
  return 'account_balance';
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

function businessLabel(b: Deposit['businessId']) {
  if (!b) return null;
  if (typeof b === 'object') return b.name || b.slug || 'Business';
  return null;
}

function depositUtr(d: Deposit) {
  return (
    d.upiDetails?.utr ||
    d.bankDetails?.utr ||
    d.usdtDetails?.txHash ||
    d.utr ||
    ''
  );
}

function DepositsEmptyPanel({
  filtered,
  p2pTotal,
  onOpenP2p,
}: {
  filtered: boolean;
  p2pTotal: number;
  onOpenP2p: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-8 text-center">
      <span className="material-symbols-outlined text-4xl text-secondary/70">south_west</span>
      <h3 className="mt-2 text-base font-bold">
        {filtered ? 'No deposits match your filters' : 'No classic deposit requests'}
      </h3>
      <p className="mx-auto mt-1.5 max-w-lg text-xs text-on-surface-variant sm:text-sm">
        {filtered
          ? 'Try a different status, method, or search term.'
          : 'Most user deposits appear under P2P payments (payer → withdrawal owner).'}
      </p>
      {!filtered && p2pTotal > 0 ? (
        <div className="mx-auto mt-4 max-w-md rounded-xl border border-secondary/30 bg-secondary-container/20 px-3 py-2.5 text-left">
          <p className="text-sm font-semibold">
            {p2pTotal} P2P payment{p2pTotal === 1 ? '' : 's'} on record
          </p>
          <Button type="button" size="sm" className="mt-2" onClick={onOpenP2p}>
            Open P2P payments
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function DepositsPage() {
  const [tab, setTab] = useState<'deposits' | 'p2p' | 'investments' | 'pay'>('p2p');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [approveTarget, setApproveTarget] = useState<Deposit | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Deposit | null>(null);
  const [utr, setUtr] = useState('');
  const [txHash, setTxHash] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
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
    () => ({ page, limit, search, status, sort, method }),
    [page, limit, search, status, sort, method],
  );

  const { data: depositDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['deposit', detailId],
    queryFn: () => depositsApi.getById(detailId!),
    enabled: !!detailId,
  });

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['deposits', listQuery],
    queryFn: () =>
      status === 'pending'
        ? depositsApi.getPending(listQuery)
        : depositsApi.getAll(listQuery),
    enabled: tab === 'deposits',
  });

  const { data: p2pData } = useQuery({
    queryKey: ['withdrawal-payments', 'count-for-deposits'],
    queryFn: () => withdrawalPaymentsApi.getAll({ page: 1, limit: 1 }),
  });

  const approve = useMutation({
    mutationFn: () => {
      const u = utr.trim();
      const t = txHash.trim();
      if (u) {
        const err = utrError(u, true);
        if (err) throw new Error(err);
      }
      if (t) {
        const err = txHashError(t, true);
        if (err) throw new Error(err);
      }
      return depositsApi.approve(
        approveTarget!._id,
        u ? normalizeUtr(u) : undefined,
        t ? normalizeTxHash(t) : undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits'] });
      setApproveTarget(null);
      setUtr('');
      setTxHash('');
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Approve failed')),
  });

  const reject = useMutation({
    mutationFn: () => depositsApi.reject(rejectTarget!._id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits'] });
      setRejectTarget(null);
      setRejectReason('');
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Reject failed')),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pendingOnPage = items.filter((d) => d.status === 'pending').length;
  const p2pTotal = p2pData?.total ?? 0;
  const depositsFiltered = !!(search || status !== 'all' || method !== 'all');
  const pageAmount = useMemo(
    () => items.reduce((sum, d) => sum + (d.amount || 0), 0),
    [items],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <AdminNewWithdrawalPopup />
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-low/40 to-secondary-container/15 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-secondary/10 blur-2xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
              <span className="material-symbols-outlined text-sm">south_west</span>
              Deposits
            </p>
            <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
              All deposit activity
            </h1>
            <p className="mt-1 max-w-xl text-sm text-on-surface-variant">
              Kaun deposit kiya, kisko mila, kitna — classic requests, P2P proofs, aur investments.
            </p>
          </div>
          {tab === 'deposits' ? (
            <CsvDownloadButton<Deposit>
              title="Deposits"
              filename={`deposits-${status}`}
              filters={{ Status: status, Method: method, Search: search, Sort: sort }}
              disabled={!total}
              columns={[
                { header: 'Reference', value: (d) => d.referenceId },
                { header: 'Status', value: (d) => d.status },
                { header: 'Method', value: (d) => d.method },
                { header: 'Amount', value: (d) => d.amount },
                { header: 'Currency', value: (d) => d.currency },
                { header: 'Commission', value: (d) => d.commissionAmount ?? 0 },
                { header: 'From name', value: (d) => personCsvCells(d.userId)[0] },
                { header: 'From email', value: (d) => personCsvCells(d.userId)[1] },
                { header: 'From phone', value: (d) => personCsvCells(d.userId)[2] },
                { header: 'From role', value: (d) => personCsvCells(d.userId)[3] },
                {
                  header: 'To business',
                  value: (d) => businessLabel(d.businessId) || '',
                },
                { header: 'UTR / Tx', value: (d) => depositUtr(d) },
                { header: 'Created', value: (d) => d.createdAt },
              ]}
              fetchRows={() =>
                fetchAllPages((p, l) =>
                  status === 'pending'
                    ? depositsApi.getPending({ ...listQuery, page: p, limit: l })
                    : depositsApi.getAll({ ...listQuery, page: p, limit: l }),
                )
              }
            />
          ) : null}
        </div>
      </div>

      <div className="chip-scroll">
        {(
          [
            { id: 'pay', label: 'Make deposit' },
            { id: 'p2p', label: `P2P payments${p2pTotal ? ` (${p2pTotal})` : ''}` },
            { id: 'deposits', label: 'Classic deposits' },
            { id: 'investments', label: 'Investments' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:px-4 sm:py-1.5 sm:text-sm ${
              tab === t.id ? 'bg-primary text-on-primary' : 'border border-outline-variant'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pay' ? (
        <AdminDepositPayPanel />
      ) : tab === 'investments' ? (
        <InvestmentsTab />
      ) : tab === 'p2p' ? (
        <SplitPaymentsTab />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                Total
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{total}</p>
            </div>
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                Page
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{items.length}</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800/80">
                Pending
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-800">{pendingOnPage}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">
                Page amount
              </p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-emerald-800 sm:text-lg">
                {formatCurrency(pageAmount)}
              </p>
            </div>
          </div>

          <Card>
            <div className="mb-3 space-y-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Input
                  className="min-w-0 flex-1 sm:min-w-[200px]"
                  placeholder="Search ref, UTR, user…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
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
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      setStatus(s.value);
                      setPage(1);
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                      status === s.value
                        ? 'bg-primary text-on-primary'
                        : 'border border-outline-variant'
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
              <EmptyState
                message={getApiErrorMessage(error, 'Failed to load deposits')}
                icon="error"
              />
            ) : !items.length ? (
              <DepositsEmptyPanel
                filtered={depositsFiltered}
                p2pTotal={p2pTotal}
                onOpenP2p={() => setTab('p2p')}
              />
            ) : (
              <>
                <div className={cn('space-y-2', isFetching && 'opacity-70')}>
                  {items.map((d) => {
                    const from = asPerson(d.userId);
                    const toBiz = businessLabel(d.businessId);
                    const utrOrTx = depositUtr(d);
                    return (
                      <div
                        key={d._id}
                        className={cn(
                          'overflow-hidden rounded-xl border border-outline-variant/80 border-l-[3px] bg-surface-container-lowest p-2.5 shadow-sm sm:p-3',
                          statusAccent(d.status),
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setDetailId(d._id)}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-0.5 rounded bg-secondary-container/30 px-1.5 py-0.5 text-[10px] font-bold uppercase text-secondary">
                                <span className="material-symbols-outlined text-[12px]">
                                  {methodIcon(d.method)}
                                </span>
                                {d.method}
                              </span>
                              <StatusBadge status={d.status} />
                              <span className="truncate font-mono text-[10px] text-on-surface-variant">
                                {d.referenceId}
                              </span>
                            </div>
                            <p className="mt-1.5 text-[12px] leading-snug">
                              <span className="font-semibold text-on-surface">
                                {from?.name || 'User'}
                              </span>
                              {from?.role ? (
                                <span className="text-on-surface-variant"> · {from.role}</span>
                              ) : null}
                              <span className="mx-1 font-bold text-secondary">→</span>
                              <span className="font-semibold text-on-surface">
                                {toBiz || 'Wallet credit'}
                              </span>
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">
                              {[from?.email, from?.phone, formatDate(d.createdAt)]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {utrOrTx ? (
                              <p className="mt-0.5 font-mono text-[10px] text-secondary">
                                {utrOrTx}
                              </p>
                            ) : null}
                          </button>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-bold tabular-nums text-emerald-700 sm:text-base">
                              {formatCurrency(d.amount, d.currency)}
                            </p>
                            {(d.commissionAmount || 0) > 0 ? (
                              <p className="text-[10px] text-rose-600">
                                Fee −{formatCurrency(d.commissionAmount!, d.currency)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setDetailId(d._id)}>
                            Details
                          </Button>
                          {d.status === 'pending' ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setApproveTarget(d)}
                              >
                                Approve
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => setRejectTarget(d)}>
                                Reject
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4">
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

          <Modal
            open={!!approveTarget}
            onClose={() => {
              setApproveTarget(null);
              setActionError('');
            }}
            title="Approve Deposit"
          >
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setActionError('');
                approve.mutate();
              }}
            >
              <p className="text-sm text-on-surface-variant">
                {approveTarget?.referenceId} —{' '}
                {formatCurrency(approveTarget?.amount ?? 0, approveTarget?.currency)}
              </p>
              {approveTarget?.method !== 'usdt' ? (
                <Input
                  label="UTR (optional)"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  placeholder="12-digit UTR / RRN (or 12–22 alphanumeric)"
                  maxLength={22}
                />
              ) : (
                <Input
                  label="Tx Hash (optional)"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="64 hex TxID (TRC20 / optional 0x)"
                  maxLength={66}
                />
              )}
              {actionError && (
                <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                  {actionError}
                </div>
              )}
              <Button type="submit" loading={approve.isPending} className="w-full">
                Confirm Approve
              </Button>
            </form>
          </Modal>

          <Modal
            open={!!rejectTarget}
            onClose={() => {
              setRejectTarget(null);
              setActionError('');
            }}
            title="Reject Deposit"
          >
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setActionError('');
                reject.mutate();
              }}
            >
              <Input
                label="Reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
              {actionError && (
                <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                  {actionError}
                </div>
              )}
              <Button type="submit" variant="danger" loading={reject.isPending} className="w-full">
                Confirm Reject
              </Button>
            </form>
          </Modal>

          <Modal
            open={!!detailId}
            onClose={() => setDetailId(null)}
            title="Deposit Details"
            className="sm:max-w-2xl"
          >
            {detailLoading ? (
              <LoadingScreen />
            ) : depositDetail ? (
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-on-surface-variant">
                        {depositDetail.referenceId}
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
                        {formatCurrency(depositDetail.amount, depositDetail.currency)}
                      </p>
                    </div>
                    <StatusBadge status={depositDetail.status} />
                  </div>
                  <p className="mt-2 text-[12px]">
                    <span className="font-semibold">
                      {asPerson(depositDetail.userId)?.name || 'User'}
                    </span>
                    <span className="mx-1 text-secondary">→</span>
                    <span className="font-semibold">
                      {businessLabel(depositDetail.businessId) || 'Wallet credit'}
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div>
                    <p className="text-on-surface-variant">Method</p>
                    <p className="font-semibold uppercase">{depositDetail.method}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant">Created</p>
                    <p className="font-semibold">{formatDate(depositDetail.createdAt)}</p>
                  </div>
                  {(depositDetail.commissionAmount || 0) > 0 ? (
                    <div>
                      <p className="text-on-surface-variant">Commission</p>
                      <p className="font-semibold text-rose-600">
                        −{formatCurrency(depositDetail.commissionAmount!, depositDetail.currency)}
                      </p>
                    </div>
                  ) : null}
                  {depositUtr(depositDetail) ? (
                    <div className="col-span-2">
                      <p className="text-on-surface-variant">UTR / Tx</p>
                      <p className="break-all font-mono font-semibold">
                        {depositUtr(depositDetail)}
                      </p>
                    </div>
                  ) : null}
                  {depositDetail.method === 'cdm' && depositDetail.cdmDetails ? (
                    <div className="col-span-2 rounded-lg border border-outline-variant px-3 py-2">
                      <p className="text-on-surface-variant">CDM details</p>
                      <p className="font-medium">{depositDetail.cdmDetails.payerName || '—'}</p>
                      {depositDetail.cdmDetails.locationHint ? (
                        <p className="text-sm text-on-surface-variant">
                          {depositDetail.cdmDetails.locationHint}
                        </p>
                      ) : null}
                      {depositDetail.cdmDetails.notes ? (
                        <p className="text-sm text-on-surface-variant">
                          {depositDetail.cdmDetails.notes}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {depositDetail.failureReason ? (
                    <div className="col-span-2">
                      <p className="text-on-surface-variant">Reason</p>
                      <p className="font-medium">{depositDetail.failureReason}</p>
                    </div>
                  ) : null}
                </div>
                <PersonDetails title="From (depositor)" person={depositDetail.userId} compact />
                {businessLabel(depositDetail.businessId) ? (
                  <div className="rounded-lg border border-outline-variant p-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-on-surface-variant">
                      To (business)
                    </p>
                    <p className="font-semibold">{businessLabel(depositDetail.businessId)}</p>
                    {typeof depositDetail.businessId === 'object' &&
                    depositDetail.businessId?.referralCode ? (
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        Code: {depositDetail.businessId.referralCode}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {depositDetail.commissionPaidTo ? (
                  <PersonDetails
                    title="Fee received by"
                    person={depositDetail.commissionPaidTo}
                    compact
                  />
                ) : null}
              </div>
            ) : null}
          </Modal>
        </>
      )}
    </div>
  );
}
