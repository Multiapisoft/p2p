'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { depositsApi } from '@/features/deposits/api/deposits.api';
import { platformPaymentsApi } from '@/features/deposits/api/platform-payments.api';
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
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import type { BusinessPlatformPayment } from '@/features/deposits/api/platform-payments.api';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
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
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value || value === '—') return null;
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-3">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="break-all text-sm font-medium">{value}</p>
    </div>
  );
}

function personSummary(
  person:
    | {
        name?: string;
        email?: string;
        phone?: string;
        role?: string;
        status?: string;
        businessUserCode?: string;
        externalRef?: string;
      }
    | string
    | undefined,
) {
  if (!person || typeof person === 'string') return null;
  return person;
}

function destinationSummary(wd: BusinessPlatformPayment['withdrawalId']) {
  if (!wd || typeof wd === 'string') return '—';
  if (wd.upiDetails?.upiId) {
    return `UPI · ${wd.upiDetails.upiId}${wd.upiDetails.payerName ? ` · ${wd.upiDetails.payerName}` : ''}`;
  }
  if (wd.bankDetails?.accountNumber) {
    return `Bank · ${wd.bankDetails.accountHolderName || '—'} · ${wd.bankDetails.accountNumber}${wd.bankDetails.ifscCode ? ` · ${wd.bankDetails.ifscCode}` : ''}`;
  }
  if (wd.usdtDetails?.walletAddress) {
    return `USDT · ${wd.usdtDetails.walletAddress}${wd.usdtDetails.network ? ` · ${wd.usdtDetails.network}` : ''}`;
  }
  return '—';
}

export function DepositsPage() {
  const [selectedPayment, setSelectedPayment] = useState<BusinessPlatformPayment | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
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

  const {
    data: platformPays,
    isLoading: loadingPays,
    isFetching,
    isError: paysError,
    error: paysErr,
    refetch: refetchPays,
  } = useQuery({
    queryKey: ['business-platform-payments', listQuery],
    queryFn: () => platformPaymentsApi.list(listQuery),
  });

  const totalFromSummary = summary?.reduce((sum, row) => sum + row.totalDeposited, 0) ?? 0;
  const payItems = platformPays?.items ?? [];
  const total = platformPays?.total ?? 0;
  const totalPages = platformPays?.totalPages ?? 1;

  if (loadingSummary && loadingPays) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Deposits"
        description="User deposit summary and Platform Payment activity"
        action={
          <CsvDownloadButton<BusinessPlatformPayment>
            filename="business-platform-payments"
            title="Platform payments"
            filters={{ Status: status, Method: method, Search: search, Sort: sort }}
            disabled={!total}
            columns={[
              { header: 'Reference', value: (p) => p.referenceId },
              { header: 'Status', value: (p) => p.status },
              { header: 'Amount', value: (p) => p.amount },
              { header: 'UTR', value: (p) => p.utr || '' },
              { header: 'Created', value: (p) => p.createdAt || '' },
            ]}
            fetchRows={() =>
              fetchAllPages((page, limit) => platformPaymentsApi.list({ ...listQuery, page, limit }))
            }
          />
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            Users with deposits
          </p>
          <p className="mt-2 font-[family-name:var(--font-headline)] text-2xl font-bold">
            {summary?.length ?? 0}
          </p>
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
      ) : summary ? (
        summary.length > 0 ? (
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
        ) : (
          <Card title="Deposit Summary by User">
            <EmptyState message="No completed deposits from users yet." icon="south_west" />
          </Card>
        )
      ) : null}

      <Card title="Platform Payment activity (your users as payers + your WDs)">
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search payment, request, UTR…"
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
                className={`chip ${status === s.value ? 'chip-active' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="chip-scroll">
            {METHOD_FILTERS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  setMethod(m.value);
                  setPage(1);
                }}
                className={`chip ${method === m.value ? 'chip-active' : ''}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {loadingPays ? (
          <LoadingScreen />
        ) : paysError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
              {getApiErrorMessage(paysErr, 'Could not load payments')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetchPays()}>
              Retry
            </Button>
          </div>
        ) : payItems.length === 0 ? (
          <EmptyState
            message={
              search || status !== 'all' || method !== 'all'
                ? 'No payments match your filters'
                : 'No Platform Payment activity yet'
            }
            icon="inbox"
          />
        ) : (
          <>
            <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
              {payItems.map((p) => {
                const payer = personSummary(p.payerUserId);
                const wd = p.withdrawalId && typeof p.withdrawalId !== 'string' ? p.withdrawalId : null;
                const owner = personSummary(wd?.userId);
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => setSelectedPayment(p)}
                    className="w-full rounded-xl border border-outline-variant p-4 text-left transition hover:border-secondary/40 hover:bg-surface-container-low/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-bold">{formatCurrency(p.amount, p.currency)}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-on-surface-variant">
                          {p.referenceId}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-surface-container-low px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                          Request
                        </p>
                        <p className="mt-0.5 break-all font-mono text-xs font-semibold">
                          {wd?.referenceId || '—'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                          {owner?.name || owner?.email || 'Owner —'}
                          {owner?.role ? ` · ${owner.role}` : ''}
                          {wd?.method ? ` · ${String(wd.method).toUpperCase()}` : ''}
                        </p>
                      </div>
                      <div className="rounded-lg bg-surface-container-low px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                          Payer
                        </p>
                        <p className="mt-0.5 truncate text-sm font-semibold">
                          {payer?.name || payer?.email || '—'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                          {[payer?.role, payer?.email, payer?.phone, payer?.businessUserCode]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </div>
                    </div>

                    {p.utr ? (
                      <p className="mt-2 break-all text-xs text-on-surface-variant">UTR {p.utr}</p>
                    ) : null}
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

      <PaymentDetailsModal
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
      />
    </div>
  );
}

function PaymentDetailsModal({
  payment,
  onClose,
}: {
  payment: BusinessPlatformPayment | null;
  onClose: () => void;
}) {
  if (!payment) return null;
  const payer = personSummary(payment.payerUserId);
  const wd = payment.withdrawalId && typeof payment.withdrawalId !== 'string' ? payment.withdrawalId : null;
  const owner = personSummary(wd?.userId);

  return (
    <Modal open={!!payment} onClose={onClose} title={`Payment ${payment.referenceId}`} className="sm:max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={payment.status} />
          {wd?.status && wd.status !== payment.status ? (
            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              Request <StatusBadge status={wd.status} />
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-lg bg-surface-container-low p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Request Owner
            </p>
            <DetailRow label="Name" value={owner?.name || '—'} />
            <DetailRow label="Email" value={owner?.email || '—'} />
            <DetailRow label="Phone" value={owner?.phone || '—'} />
            <DetailRow label="Role" value={owner?.role || '—'} />
            <DetailRow label="Code" value={owner?.businessUserCode || '—'} />
            <DetailRow label="External ref" value={owner?.externalRef || '—'} />
          </div>

          <div className="space-y-2 rounded-lg bg-surface-container-low p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Payer
            </p>
            <DetailRow label="Name" value={payer?.name || '—'} />
            <DetailRow label="Email" value={payer?.email || '—'} />
            <DetailRow label="Phone" value={payer?.phone || '—'} />
            <DetailRow label="Role" value={payer?.role || '—'} />
            <DetailRow label="Code" value={payer?.businessUserCode || '—'} />
            <DetailRow label="External ref" value={payer?.externalRef || '—'} />
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-outline-variant/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Request Details
          </p>
          <DetailRow label="Request ref" value={wd?.referenceId || '—'} />
          <DetailRow
            label="Requested amount"
            value={wd ? formatCurrency(wd.amount || 0, wd.currency || payment.currency) : '—'}
          />
          <DetailRow
            label="Paid on request"
            value={
              wd?.paidAmount != null ? formatCurrency(wd.paidAmount, wd.currency || payment.currency) : '—'
            }
          />
          <DetailRow label="Method" value={wd?.method ? String(wd.method).toUpperCase() : '—'} />
          <DetailRow label="Destination" value={destinationSummary(wd || undefined)} />
          <DetailRow label="Origin" value={wd?.origin || '—'} />
          <DetailRow label="List status" value={wd?.p2pListStatus || '—'} />
          <DetailRow label="Request created" value={wd?.createdAt ? formatDate(wd.createdAt) : '—'} />
          <DetailRow label="Request completed" value={wd?.completedAt ? formatDate(wd.completedAt) : '—'} />
        </div>

        <div className="grid gap-2 rounded-lg border border-outline-variant/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Payment Details
          </p>
          <DetailRow label="Payment ref" value={payment.referenceId} />
          <DetailRow label="Paid amount" value={formatCurrency(payment.amount, payment.currency)} />
          <DetailRow label="UTR" value={payment.utr || '—'} />
          <DetailRow
            label="Commission"
            value={payment.commissionAmount ? formatCurrency(payment.commissionAmount, payment.currency) : '—'}
          />
          <DetailRow
            label="Bonus"
            value={payment.bonusAmount ? formatCurrency(payment.bonusAmount, payment.currency) : '—'}
          />
          <DetailRow
            label="Net credited"
            value={payment.netCreditedAmount ? formatCurrency(payment.netCreditedAmount, payment.currency) : '—'}
          />
          <DetailRow label="Created" value={payment.createdAt ? formatDate(payment.createdAt) : '—'} />
          <DetailRow label="Completed" value={payment.completedAt ? formatDate(payment.completedAt) : '—'} />
          <DetailRow label="Notes" value={payment.notes || '—'} />
          <DetailRow label="Reject reason" value={payment.rejectionReason || '—'} />
          <DetailRow label="Proof URL" value={payment.proofImageUrl || '—'} />
        </div>
      </div>
    </Modal>
  );
}
