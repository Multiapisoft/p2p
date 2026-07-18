'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { withdrawalsApi } from '@/features/withdrawals/api/withdrawals.api';
import { getApiErrorMessage } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Modal } from '@/shared/components/ui/Modal';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { resolveUser } from '@/shared/lib/entity-user';
import type { Withdrawal } from '@/shared/types/api.types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
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
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-outline-variant/40 py-2 text-sm">
      <span className="shrink-0 text-on-surface-variant">{label}</span>
      <span className="text-right font-medium break-all">{value}</span>
    </div>
  );
}

function destinationLine(w: Withdrawal) {
  if (w.method === 'upi' && w.upiDetails?.upiId) return `UPI · ${w.upiDetails.upiId}`;
  if (w.method === 'bank' && w.bankDetails?.accountNumber) {
    return `Bank · ${w.bankDetails.accountHolderName || ''} · ${w.bankDetails.accountNumber}`;
  }
  if (w.method === 'usdt' && w.usdtDetails?.walletAddress) {
    return `USDT · ${w.usdtDetails.walletAddress.slice(0, 10)}…`;
  }
  return String(w.method).toUpperCase();
}

export function WithdrawalsPage() {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get('status');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState(
    statusFromUrl && STATUS_FILTERS.some((s) => s.value === statusFromUrl)
      ? statusFromUrl
      : 'all',
  );
  const [method, setMethod] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, status, method, sort, search }),
    [page, limit, status, method, sort, search],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['business-withdrawals', listQuery],
    queryFn: () => withdrawalsApi.getBusinessWithdrawals(listQuery),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['business-withdrawal', selectedId],
    queryFn: () => withdrawalsApi.getById(selectedId!),
    enabled: !!selectedId,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const completedOnPage = items.filter((w) => w.status === 'completed').length;
  const pendingOnPage = items.filter(
    (w) => w.status === 'pending' || w.status === 'processing',
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Withdrawals"
        description="User withdrawal requests under your business"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Total results
          </p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Pending / processing
          </p>
          <p className="mt-1 text-2xl font-bold">{pendingOnPage}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Completed on page
          </p>
          <p className="mt-1 text-2xl font-bold">{completedOnPage}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search reference, UPI, account…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
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
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
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
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
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
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
              {getApiErrorMessage(error, 'Could not load withdrawals')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all' || method !== 'all'
                ? 'No withdrawals match your filters'
                : 'No withdrawals yet'
            }
            icon="north_east"
          />
        ) : (
          <>
            <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((w) => {
                const user = resolveUser(w.userId);
                return (
                  <button
                    key={w._id}
                    type="button"
                    onClick={() => setSelectedId(w._id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant p-4 text-left transition hover:border-secondary/40 hover:bg-surface-container-low/50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {formatCurrency(w.amount, w.currency)}
                        {(w.paidAmount || 0) > 0 && (
                          <span className="ml-2 text-xs font-medium text-secondary">
                            paid {formatCurrency(w.paidAmount || 0, w.currency)}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 truncate text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {user.email || '—'} · {w.referenceId}
                      </p>
                      <p className="mt-0.5 text-xs text-outline">
                        {destinationLine(w)} · {formatDate(w.createdAt)}
                        {w.paymentCount ? ` · ${w.paymentCount} payments` : ''}
                      </p>
                    </div>
                    <StatusBadge status={w.status} />
                  </button>
                );
              })}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="Withdrawal details"
        className="sm:max-w-xl"
      >
        {loadingDetail || !detail ? (
          <LoadingScreen />
        ) : (
          <div className="space-y-1">
            {(() => {
              const user = resolveUser(detail.userId);
              return (
                <>
                  <DetailRow label="Amount" value={formatCurrency(detail.amount, detail.currency)} />
                  <DetailRow
                    label="Paid"
                    value={formatCurrency(detail.paidAmount || 0, detail.currency)}
                  />
                  <DetailRow
                    label="Remaining"
                    value={formatCurrency(detail.remainingAmount || 0, detail.currency)}
                  />
                  <DetailRow label="Status" value={<StatusBadge status={detail.status} />} />
                  <DetailRow label="Method" value={String(detail.method).toUpperCase()} />
                  <DetailRow label="Reference" value={detail.referenceId} />
                  <DetailRow label="User" value={user.name} />
                  <DetailRow label="Email" value={user.email || '—'} />
                  {user.phone ? <DetailRow label="Phone" value={user.phone} /> : null}
                  {user.externalRef ? (
                    <DetailRow label="External ref" value={user.externalRef} />
                  ) : null}
                  <DetailRow label="Destination" value={destinationLine(detail)} />
                  {detail.upiDetails?.utr ? (
                    <DetailRow label="UTR" value={detail.upiDetails.utr} />
                  ) : null}
                  {detail.bankDetails?.ifscCode ? (
                    <DetailRow label="IFSC" value={detail.bankDetails.ifscCode} />
                  ) : null}
                  {detail.bankDetails?.bankName ? (
                    <DetailRow label="Bank" value={detail.bankDetails.bankName} />
                  ) : null}
                  {detail.usdtDetails?.network ? (
                    <DetailRow label="Network" value={detail.usdtDetails.network} />
                  ) : null}
                  {detail.usdtDetails?.txHash ? (
                    <DetailRow label="Tx hash" value={detail.usdtDetails.txHash} />
                  ) : null}
                  {(detail.commissionAmount || 0) > 0 ? (
                    <DetailRow
                      label="Commission cut"
                      value={formatCurrency(detail.commissionAmount!, detail.currency)}
                    />
                  ) : null}
                  {detail.failureReason ? (
                    <DetailRow label="Failure" value={detail.failureReason} />
                  ) : null}
                  <DetailRow label="Created" value={formatDate(detail.createdAt)} />
                  {detail.completedAt ? (
                    <DetailRow label="Completed" value={formatDate(detail.completedAt)} />
                  ) : null}

                  {(detail.payments?.length || 0) > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-sm font-semibold">Split payments</p>
                      <div className="space-y-2">
                        {detail.payments!.map((p) => {
                          const commission =
                            p.commissionAmount ?? p.estimatedCommissionAmount ?? 0;
                          const bonus = p.bonusAmount ?? p.estimatedBonusAmount ?? 0;
                          const net =
                            p.netCreditedAmount ?? p.estimatedNetCredited;
                          return (
                          <div
                            key={p._id}
                            className="rounded-lg border border-outline-variant/60 p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold">
                                {formatCurrency(p.amount, p.currency)}
                              </span>
                              <StatusBadge status={p.status} />
                            </div>
                            <p className="mt-1 font-mono text-xs text-on-surface-variant">
                              {p.referenceId}
                            </p>
                            {p.utr ? <p className="text-xs">UTR: {p.utr}</p> : null}
                            <div className="mt-2 space-y-0.5 text-xs text-on-surface-variant">
                              {commission > 0 ? (
                                <p>
                                  Commission cut:{' '}
                                  <span className="font-semibold text-error">
                                    −{formatCurrency(commission, p.currency)}
                                  </span>
                                  {p.status === 'pending' ? ' (est.)' : ''}
                                </p>
                              ) : null}
                              {bonus > 0 ? (
                                <p>
                                  Payer bonus:{' '}
                                  <span className="font-semibold text-secondary">
                                    +{formatCurrency(bonus, p.currency)}
                                  </span>
                                </p>
                              ) : null}
                              {net != null ? (
                                <p>
                                  Payer credit:{' '}
                                  <span className="font-semibold text-on-surface">
                                    {formatCurrency(net, p.currency)}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                            {p.notes ? (
                              <p className="text-xs text-on-surface-variant">{p.notes}</p>
                            ) : null}
                            {p.proofImageUrl ? (
                              <a
                                href={p.proofImageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-block text-xs font-semibold text-secondary hover:underline"
                              >
                                View proof
                              </a>
                            ) : null}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
