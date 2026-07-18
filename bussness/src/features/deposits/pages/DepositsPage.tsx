'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { depositsApi } from '@/features/deposits/api/deposits.api';
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
import type { Deposit } from '@/shared/types/api.types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
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

function paymentLine(d: Deposit) {
  if (d.method === 'upi' && d.upiDetails?.upiId) {
    return `UPI · ${d.upiDetails.upiId}${d.upiDetails.utr ? ` · UTR ${d.upiDetails.utr}` : ''}`;
  }
  if (d.method === 'bank' && d.bankDetails?.accountNumber) {
    return `Bank · ${d.bankDetails.accountHolderName || ''} · ${d.bankDetails.accountNumber}`;
  }
  if (d.method === 'usdt' && d.usdtDetails?.walletAddress) {
    return `USDT · ${d.usdtDetails.walletAddress.slice(0, 12)}…`;
  }
  return String(d.method).toUpperCase();
}

export function DepositsPage() {
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

  const {
    data: summary,
    isLoading: loadingSummary,
    isError: summaryError,
    error: summaryErr,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['deposits-summary'],
    queryFn: () => depositsApi.getBusinessSummary(),
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['business-deposits', listQuery],
    queryFn: () => depositsApi.getBusinessDeposits(listQuery),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['business-deposit', selectedId],
    queryFn: () => depositsApi.getById(selectedId!),
    enabled: !!selectedId,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const totalFromSummary = summary?.reduce((sum, row) => sum + row.totalDeposited, 0) ?? 0;

  if (loadingSummary && isLoading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title="Deposits" description="Business deposit activity & per-user summary" />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            Total Completed
          </p>
          <p className="mt-2 font-[family-name:var(--font-headline)] text-2xl font-bold">
            {formatCurrency(totalFromSummary)}
          </p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            Active Users
          </p>
          <p className="mt-2 font-[family-name:var(--font-headline)] text-2xl font-bold">
            {summary?.length ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            All Deposits
          </p>
          <p className="mt-2 font-[family-name:var(--font-headline)] text-2xl font-bold">{total}</p>
        </div>
      </section>

      {summaryError ? (
        <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
          <p className="text-sm font-medium text-on-surface">
            {getApiErrorMessage(summaryErr, 'Could not load deposit summary')}
          </p>
          <Button type="button" className="mt-4" size="sm" onClick={() => refetchSummary()}>
            Retry summary
          </Button>
        </div>
      ) : (
        summary &&
        summary.length > 0 && (
          <Card title="Deposit Summary by User">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-outline-variant text-on-surface-variant">
                    <th className="pb-3 pr-4 font-semibold">User</th>
                    <th className="pb-3 pr-4 font-semibold">Email</th>
                    <th className="pb-3 pr-4 font-semibold">Deposits</th>
                    <th className="pb-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.userId} className="border-b border-outline-variant/50">
                      <td className="py-3 pr-4 font-medium">{row.userName}</td>
                      <td className="py-3 pr-4 text-on-surface-variant">{row.userEmail}</td>
                      <td className="py-3 pr-4">{row.depositCount}</td>
                      <td className="py-3 font-semibold">{formatCurrency(row.totalDeposited)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      <Card title="All Deposits">
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search reference, UPI, account, external ref…"
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
              {getApiErrorMessage(error, 'Could not load deposits')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all' || method !== 'all'
                ? 'No deposits match your filters'
                : 'No deposits yet'
            }
            icon="south_west"
          />
        ) : (
          <>
            <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((d) => {
                const user = resolveUser(d.userId);
                return (
                  <button
                    key={d._id}
                    type="button"
                    onClick={() => setSelectedId(d._id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant p-4 text-left transition hover:border-secondary/40 hover:bg-surface-container-low/50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{formatCurrency(d.amount, d.currency)}</p>
                      <p className="mt-1 truncate text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {user.email || '—'} · {d.referenceId}
                      </p>
                      <p className="mt-0.5 text-xs text-outline">
                        {paymentLine(d)} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={d.status} />
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
        title="Deposit details"
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
                  <DetailRow label="Status" value={<StatusBadge status={detail.status} />} />
                  <DetailRow label="Method" value={String(detail.method).toUpperCase()} />
                  <DetailRow label="Reference" value={detail.referenceId} />
                  <DetailRow label="User" value={user.name} />
                  <DetailRow label="Email" value={user.email || '—'} />
                  {user.phone ? <DetailRow label="Phone" value={user.phone} /> : null}
                  {user.externalRef ? (
                    <DetailRow label="User external ref" value={user.externalRef} />
                  ) : null}
                  {detail.externalRef ? (
                    <DetailRow label="Deposit external ref" value={detail.externalRef} />
                  ) : null}
                  {detail.upiDetails?.upiId ? (
                    <DetailRow label="UPI ID" value={detail.upiDetails.upiId} />
                  ) : null}
                  {detail.upiDetails?.payerName ? (
                    <DetailRow label="Payer name" value={detail.upiDetails.payerName} />
                  ) : null}
                  {detail.upiDetails?.utr ? (
                    <DetailRow label="UTR" value={detail.upiDetails.utr} />
                  ) : null}
                  {detail.bankDetails?.accountNumber ? (
                    <DetailRow label="Account" value={detail.bankDetails.accountNumber} />
                  ) : null}
                  {detail.bankDetails?.ifscCode ? (
                    <DetailRow label="IFSC" value={detail.bankDetails.ifscCode} />
                  ) : null}
                  {detail.bankDetails?.accountHolderName ? (
                    <DetailRow label="Holder" value={detail.bankDetails.accountHolderName} />
                  ) : null}
                  {detail.bankDetails?.bankName ? (
                    <DetailRow label="Bank" value={detail.bankDetails.bankName} />
                  ) : null}
                  {detail.bankDetails?.utr ? (
                    <DetailRow label="UTR" value={detail.bankDetails.utr} />
                  ) : null}
                  {detail.usdtDetails?.walletAddress ? (
                    <DetailRow label="Wallet" value={detail.usdtDetails.walletAddress} />
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
                </>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
