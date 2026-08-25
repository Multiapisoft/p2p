'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withdrawalPaymentsApi } from '../api/withdrawal-payments.api';
import type { WithdrawalPaymentAdmin } from '../api/withdrawal-payments.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { cn, formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { asPerson, fetchAllPages, personCsvCells } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { PersonDetails } from '@/shared/components/PersonDetails';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
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

const PAGE_SIZES = [10, 20, 50];

function paymentCommission(p: WithdrawalPaymentAdmin) {
  return p.commissionAmount ?? p.estimatedCommissionAmount ?? 0;
}

function paymentBonus(p: WithdrawalPaymentAdmin) {
  return p.bonusAmount ?? p.estimatedBonusAmount ?? 0;
}

function paymentNet(p: WithdrawalPaymentAdmin) {
  return p.netCreditedAmount ?? p.estimatedNetCredited;
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

function payeeName(p: WithdrawalPaymentAdmin) {
  const w = p.withdrawalId;
  const user = asPerson(w?.userId);
  if (user?.name) return user.name;
  if (typeof w?.businessId === 'object' && w.businessId?.name) return w.businessId.name;
  return 'Withdrawal owner';
}

function businessName(p: WithdrawalPaymentAdmin) {
  const b = p.withdrawalId?.businessId;
  if (typeof b === 'object') return b.name || null;
  return null;
}

export function SplitPaymentsTab() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [listMode, setListMode] = useState<'pending' | 'all'>('all');
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<WithdrawalPaymentAdmin | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalPaymentAdmin | null>(null);
  const [rejectReason, setRejectReason] = useState('');
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
      status: listMode === 'pending' ? 'pending' : status,
      sort,
      method,
    }),
    [page, limit, search, status, sort, method, listMode],
  );

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['split-payments', listMode, listQuery],
    queryFn: () =>
      listMode === 'pending'
        ? withdrawalPaymentsApi.getPending(listQuery)
        : withdrawalPaymentsApi.getAll(listQuery),
  });

  const approve = useMutation({
    mutationFn: (id: string) => withdrawalPaymentsApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['split-payments'] });
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['withdrawal-payments'] });
      setDetail(null);
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Approve failed')),
  });

  const reject = useMutation({
    mutationFn: () => withdrawalPaymentsApi.reject(rejectTarget!._id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['split-payments'] });
      qc.invalidateQueries({ queryKey: ['withdrawal-payments'] });
      setRejectTarget(null);
      setRejectReason('');
      setDetail(null);
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Reject failed')),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pendingOnPage = items.filter((p) => p.status === 'pending').length;
  const pageAmount = useMemo(
    () => items.reduce((sum, p) => sum + (p.amount || 0), 0),
    [items],
  );
  const withdrawal = detail?.withdrawalId;
  const detailPayee = asPerson(withdrawal?.userId);
  const detailPayer = asPerson(detail?.payerUserId);

  return (
    <div className="space-y-3 sm:space-y-4">
      {actionError ? (
        <div className="rounded-lg bg-error-container px-3 py-2.5 text-sm text-on-error-container">
          {actionError}
        </div>
      ) : null}

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
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800/80">Pending</p>
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-on-surface-variant sm:text-sm">
              Payer → payee · {total} payment{total === 1 ? '' : 's'}
            </p>
            <CsvDownloadButton<WithdrawalPaymentAdmin>
              title="P2P payments"
              filename={`p2p-payments-${listMode}`}
              filters={{ View: listMode, Status: status, Method: method, Search: search, Sort: sort }}
              disabled={!total}
              columns={[
                { header: 'Payment ref', value: (p) => p.referenceId },
                { header: 'Status', value: (p) => p.status },
                { header: 'Amount', value: (p) => p.amount },
                { header: 'UTR', value: (p) => p.utr },
                { header: 'From name', value: (p) => personCsvCells(p.payerUserId)[0] },
                { header: 'From email', value: (p) => personCsvCells(p.payerUserId)[1] },
                { header: 'From phone', value: (p) => personCsvCells(p.payerUserId)[2] },
                { header: 'From role', value: (p) => personCsvCells(p.payerUserId)[3] },
                {
                  header: 'To name',
                  value: (p) => personCsvCells(p.withdrawalId?.userId)[0],
                },
                {
                  header: 'To email',
                  value: (p) => personCsvCells(p.withdrawalId?.userId)[1],
                },
                {
                  header: 'To role',
                  value: (p) => personCsvCells(p.withdrawalId?.userId)[3],
                },
                {
                  header: 'Business',
                  value: (p) => businessName(p) || '',
                },
                { header: 'Withdrawal', value: (p) => p.withdrawalId?.referenceId || '' },
                { header: 'Created', value: (p) => p.createdAt },
              ]}
              fetchRows={() =>
                fetchAllPages((p, l) =>
                  listMode === 'pending'
                    ? withdrawalPaymentsApi.getPending({ ...listQuery, page: p, limit: l })
                    : withdrawalPaymentsApi.getAll({ ...listQuery, page: p, limit: l }),
                )
              }
            />
          </div>

          <div className="chip-scroll">
            {(['all', 'pending'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setListMode(t);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                  listMode === t
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant'
                }`}
              >
                {t === 'pending' ? 'Pending proofs' : 'All payments'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[200px]"
              placeholder="Search ref, UTR, payer…"
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

          {listMode === 'all' ? (
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
          ) : null}
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <EmptyState
            message={getApiErrorMessage(error, 'Failed to load P2P payments')}
            icon="error"
          />
        ) : !items.length ? (
          <EmptyState
            message={
              search || (listMode === 'all' && status !== 'all') || method !== 'all'
                ? 'No P2P payments match your filters'
                : 'No P2P payments'
            }
            icon="payments"
          />
        ) : (
          <>
            <div className={cn('space-y-2', isFetching && 'opacity-70')}>
              {items.map((p) => {
                const payer = asPerson(p.payerUserId);
                const to = payeeName(p);
                const toUser = asPerson(p.withdrawalId?.userId);
                const biz = businessName(p);
                return (
                  <div
                    key={p._id}
                    className={cn(
                      'overflow-hidden rounded-xl border border-outline-variant/80 border-l-[3px] bg-surface-container-lowest p-2.5 shadow-sm sm:p-3',
                      statusAccent(p.status),
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setDetail(p)}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={p.status} />
                          {p.withdrawalId?.method ? (
                            <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-surface-variant">
                              {p.withdrawalId.method}
                            </span>
                          ) : null}
                          <span className="truncate font-mono text-[10px] text-on-surface-variant">
                            {p.referenceId}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-snug">
                          <span className="font-semibold text-on-surface">
                            {payer?.name || 'Payer'}
                          </span>
                          {payer?.role ? (
                            <span className="text-on-surface-variant"> · {payer.role}</span>
                          ) : null}
                          <span className="mx-1 font-bold text-secondary">→</span>
                          <span className="font-semibold text-on-surface">{to}</span>
                          {toUser?.role ? (
                            <span className="text-on-surface-variant"> · {toUser.role}</span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">
                          {[
                            biz ? `Biz: ${biz}` : null,
                            p.withdrawalId?.referenceId
                              ? `WD ${p.withdrawalId.referenceId}`
                              : null,
                            formatDate(p.createdAt),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {p.utr ? (
                          <p className="mt-0.5 font-mono text-[10px] text-secondary">
                            UTR {p.utr}
                          </p>
                        ) : null}
                      </button>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-emerald-700 sm:text-base">
                          {formatCurrency(p.amount, p.currency)}
                        </p>
                        {paymentCommission(p) > 0 ? (
                          <p className="text-[10px] text-rose-600">
                            Fee −{formatCurrency(paymentCommission(p), p.currency)}
                          </p>
                        ) : null}
                        {paymentBonus(p) > 0 ? (
                          <p className="text-[10px] text-secondary">
                            Bonus +{formatCurrency(paymentBonus(p), p.currency)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setDetail(p)}>
                        Details
                      </Button>
                      {p.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={approve.isPending}
                            onClick={() => {
                              setActionError('');
                              approve.mutate(p._id);
                            }}
                          >
                            Approve
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setRejectTarget(p)}>
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

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Payment details" className="sm:max-w-2xl">
        {detail ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-on-surface-variant">{detail.referenceId}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
                    {formatCurrency(detail.amount, detail.currency)}
                  </p>
                </div>
                <StatusBadge status={detail.status} />
              </div>
              <p className="mt-2 text-[12px]">
                <span className="font-semibold">{detailPayer?.name || 'Payer'}</span>
                <span className="mx-1 text-secondary">→</span>
                <span className="font-semibold">{payeeName(detail)}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
              <div>
                <p className="text-on-surface-variant">UTR</p>
                <p className="break-all font-mono font-semibold">{detail.utr || '—'}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Created</p>
                <p className="font-semibold">{formatDate(detail.createdAt)}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Commission</p>
                <p className="font-semibold text-rose-600">
                  {paymentCommission(detail) > 0
                    ? `−${formatCurrency(paymentCommission(detail))}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant">Bonus / net</p>
                <p className="font-semibold">
                  {paymentBonus(detail) > 0
                    ? `+${formatCurrency(paymentBonus(detail))}`
                    : '—'}
                  {paymentNet(detail) != null
                    ? ` · net ${formatCurrency(paymentNet(detail)!)}`
                    : ''}
                </p>
              </div>
              {withdrawal ? (
                <>
                  <div>
                    <p className="text-on-surface-variant">Withdrawal</p>
                    <p className="font-mono text-[11px] font-semibold">
                      {withdrawal.referenceId}
                    </p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant">WD paid / total</p>
                    <p className="font-semibold">
                      {formatCurrency(withdrawal.paidAmount ?? 0)} /{' '}
                      {formatCurrency(withdrawal.amount)}
                    </p>
                  </div>
                </>
              ) : null}
              {businessName(detail) ? (
                <div className="col-span-2">
                  <p className="text-on-surface-variant">Business</p>
                  <p className="font-semibold">{businessName(detail)}</p>
                </div>
              ) : null}
            </div>

            <PersonDetails title="From (payer)" person={detail.payerUserId} compact />
            <PersonDetails title="To (withdrawal owner)" person={withdrawal?.userId} compact />

            {detail.proofImageUrl ? (
              <div className="overflow-hidden rounded-xl border border-outline-variant">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.proofImageUrl}
                  alt="Payment proof"
                  className="max-h-80 w-full bg-black/5 object-contain"
                />
              </div>
            ) : null}

            {detail.status === 'pending' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="flex-1"
                  loading={approve.isPending}
                  onClick={() => {
                    setActionError('');
                    approve.mutate(detail._id);
                  }}
                >
                  Approve
                </Button>
                <Button
                  className="flex-1"
                  variant="danger"
                  onClick={() => setRejectTarget(detail)}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setActionError('');
        }}
        title="Reject payment"
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
          {actionError ? (
            <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              {actionError}
            </div>
          ) : null}
          <Button type="submit" variant="danger" loading={reject.isPending} className="w-full">
            Confirm Reject
          </Button>
        </form>
      </Modal>
    </div>
  );
}
