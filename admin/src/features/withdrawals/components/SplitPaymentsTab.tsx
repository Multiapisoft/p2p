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
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';

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

const PAGE_SIZES = [5, 10, 20];

function paymentCommission(p: WithdrawalPaymentAdmin) {
  return p.commissionAmount ?? p.estimatedCommissionAmount ?? 0;
}

function paymentBonus(p: WithdrawalPaymentAdmin) {
  return p.bonusAmount ?? p.estimatedBonusAmount ?? 0;
}

function paymentNet(p: WithdrawalPaymentAdmin) {
  return p.netCreditedAmount ?? p.estimatedNetCredited;
}

export function SplitPaymentsTab() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [listMode, setListMode] = useState<'pending' | 'all'>('pending');
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
      setDetail(null);
      setActionError('');
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Approve failed')),
  });

  const reject = useMutation({
    mutationFn: () => withdrawalPaymentsApi.reject(rejectTarget!._id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['split-payments'] });
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
  const withdrawal = detail?.withdrawalId;

  return (
    <div className="space-y-3 sm:space-y-4">
      {actionError && (
        <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {actionError}
        </div>
      )}
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
          <div className="chip-scroll">
            {(['pending', 'all'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setListMode(t);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  listMode === t
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant'
                }`}
              >
                {t === 'pending' ? 'Pending Proofs' : 'All'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search reference, UTR, payer…"
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

          {listMode === 'all' && (
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
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <EmptyState
            message={getApiErrorMessage(error, 'Failed to load split payments')}
            icon="error"
          />
        ) : !items.length ? (
          <EmptyState
            message={
              search || (listMode === 'all' && status !== 'all') || method !== 'all'
                ? 'No split payments match your filters'
                : 'No split payments'
            }
            icon="payments"
          />
        ) : (
          <>
            <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((p) => {
                const w = p.withdrawalId;
                return (
                  <div
                    key={p._id}
                    className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3 sm:gap-3 sm:rounded-xl sm:p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.referenceId}</p>
                      <p className="text-xs text-on-surface-variant sm:text-sm">
                        Payer: {p.payerUserId?.name} ({p.payerUserId?.email})
                      </p>
                      <p className="text-xs text-on-surface-variant sm:text-sm">
                        Withdrawal: {w?.referenceId} · UTR:{' '}
                        <span className="font-mono">{p.utr}</span>
                      </p>
                      <p className="text-xs text-on-surface-variant">{formatDate(p.createdAt)}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <div className="text-left sm:text-right">
                          <p className="text-base font-bold text-secondary sm:text-lg">
                            {formatCurrency(p.amount, p.currency)}
                          </p>
                          <StatusBadge status={p.status} />
                          {paymentCommission(p) > 0 && (
                            <p className="mt-1 text-[11px] text-on-surface-variant">
                              Commission cut{' '}
                              <span className="font-semibold text-error">
                                −{formatCurrency(paymentCommission(p), p.currency)}
                              </span>
                            </p>
                          )}
                          {paymentBonus(p) > 0 && (
                            <p className="text-[11px] text-secondary">
                              Investor bonus +{formatCurrency(paymentBonus(p), p.currency)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetail(p)}>
                          View Proof
                        </Button>
                        {p.status === 'pending' && (
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
                        )}
                      </div>
                    </div>
                  </div>
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

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Payment Proof">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-on-surface-variant">Pay amount</p>
                <p className="font-bold">{formatCurrency(detail.amount)}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">UTR</p>
                <p className="font-mono font-bold">{detail.utr}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Commission cut</p>
                <p className="font-bold text-error">
                  {paymentCommission(detail) > 0
                    ? `−${formatCurrency(paymentCommission(detail))}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant">Investor bonus</p>
                <p className="font-bold text-secondary">
                  {paymentBonus(detail) > 0
                    ? `+${formatCurrency(paymentBonus(detail))}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant">Wallet credit (investor)</p>
                <p className="font-bold">
                  {paymentNet(detail) != null
                    ? formatCurrency(paymentNet(detail)!)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant">Status</p>
                <StatusBadge status={detail.status} />
              </div>
              {withdrawal && (
                <>
                  <div>
                    <p className="text-on-surface-variant">Withdrawal Total</p>
                    <p className="font-bold">{formatCurrency(withdrawal.amount)}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant">Already Paid</p>
                    <p className="font-bold">{formatCurrency(withdrawal.paidAmount ?? 0)}</p>
                  </div>
                </>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-outline-variant">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.proofImageUrl}
                alt="Payment proof"
                className="max-h-96 w-full object-contain bg-black/5"
              />
            </div>
            {detail.status === 'pending' && (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  loading={approve.isPending}
                  onClick={() => approve.mutate(detail._id)}
                >
                  Approve Payment
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    setRejectTarget(detail);
                    setDetail(null);
                  }}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Payment">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate();
          }}
        >
          <Input
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
          />
          <Button type="submit" variant="danger" loading={reject.isPending} className="w-full">
            Confirm Reject
          </Button>
        </form>
      </Modal>
    </div>
  );
}
