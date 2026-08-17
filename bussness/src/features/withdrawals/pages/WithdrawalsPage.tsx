'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

function destinationRows(w: Withdrawal): { label: string; value: string }[] {
  if (w.method === 'upi') {
    return [
      w.upiDetails?.payerName ? { label: 'Name', value: w.upiDetails.payerName } : null,
      w.upiDetails?.upiId ? { label: 'UPI ID', value: w.upiDetails.upiId } : null,
      w.upiDetails?.utr ? { label: 'UTR', value: w.upiDetails.utr } : null,
    ].filter(Boolean) as { label: string; value: string }[];
  }
  if (w.method === 'bank') {
    const b = w.bankDetails;
    return [
      b?.accountHolderName ? { label: 'Name', value: b.accountHolderName } : null,
      b?.bankName ? { label: 'Bank name', value: b.bankName } : null,
      b?.accountNumber ? { label: 'Account number', value: b.accountNumber } : null,
      b?.ifscCode ? { label: 'IFSC', value: b.ifscCode } : null,
      b?.utr ? { label: 'UTR', value: b.utr } : null,
    ].filter(Boolean) as { label: string; value: string }[];
  }
  if (w.method === 'usdt') {
    const u = w.usdtDetails;
    return [
      u?.walletAddress ? { label: 'USDT wallet', value: u.walletAddress } : null,
      u?.network ? { label: 'Network', value: u.network } : null,
      u?.txHash ? { label: 'Tx hash', value: u.txHash } : null,
    ].filter(Boolean) as { label: string; value: string }[];
  }
  return [{ label: 'Method', value: String(w.method).toUpperCase() }];
}

function destinationLine(w: Withdrawal) {
  return destinationRows(w)
    .map((r) => `${r.label} ${r.value}`)
    .join(' · ');
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
  const [approveTarget, setApproveTarget] = useState<Withdrawal | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Withdrawal | null>(null);
  const [utr, setUtr] = useState('');
  const [txHash, setTxHash] = useState('');
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

  const listForP2p = useMutation({
    mutationFn: (id: string) => withdrawalsApi.listForP2p(id),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Failed to list for Platform Payment')),
  });

  const unlistForP2p = useMutation({
    mutationFn: (id: string) =>
      withdrawalsApi.unlistForP2p(id, 'Removed from Platform Payment list by business'),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Failed to unlist')),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      withdrawalsApi.approve(id, {
        utr: utr.trim() || undefined,
        txHash: txHash.trim() || undefined,
      }),
    onSuccess: () => {
      setActionError('');
      setApproveTarget(null);
      setUtr('');
      setTxHash('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Approve failed')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      withdrawalsApi.reject(id, reason),
    onSuccess: () => {
      setActionError('');
      setRejectTarget(null);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Reject failed')),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const completedOnPage = items.filter((w) => w.status === 'completed').length;
  const pendingOnPage = items.filter(
    (w) => w.status === 'pending' || w.status === 'processing',
  ).length;
  const awaitingP2p = items.filter(
    (w) =>
      (w.status === 'pending' || w.status === 'processing') &&
      (w.p2pListStatus || 'awaiting') !== 'listed',
  ).length;

  function p2pLabel(w: Withdrawal) {
    const s = w.p2pListStatus || 'awaiting';
    if (s === 'listed') return 'Approved';
    if (s === 'rejected') return 'Approval rejected';
    return 'Awaiting approval';
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Withdrawals"
        description="Approve = verified, now visible to everyone to pay. It is not marked paid. Use Mark paid by business only if you paid the user yourself."
      />

      {actionError ? (
        <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          {actionError}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Awaiting Platform Payment approval
          </p>
          <p className="mt-1 text-2xl font-bold">{awaitingP2p}</p>
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
                  <div
                    key={w._id}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant p-4"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(w._id)}
                      className="min-w-0 flex-1 text-left transition hover:opacity-80"
                    >
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
                        {user.businessUserCode ? ` · ${user.businessUserCode}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-outline">
                        {destinationLine(w)} · {formatDate(w.createdAt)}
                        {w.paymentCount ? ` · ${w.paymentCount} payments` : ''}
                      </p>
                    </button>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                          {p2pLabel(w)}
                        </span>
                      </div>
                      {w.status === 'pending' && (w.paidAmount || 0) <= 0 && (
                        <div className="flex gap-2">
                          {(w.p2pListStatus || 'awaiting') !== 'listed' ? (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                listForP2p.mutate(w._id);
                              }}
                              loading={listForP2p.isPending}
                            >
                              Approve
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionError('');
                              setRejectReason('');
                              setRejectTarget(w);
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {(w.status === 'pending' || w.status === 'processing') &&
                        (w.p2pListStatus || 'awaiting') !== 'listed' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionError('');
                              setUtr('');
                              setTxHash('');
                              setApproveTarget(w);
                            }}
                          >
                            Mark paid by business
                          </Button>
                        )}
                      {(w.status === 'pending' || w.status === 'processing') &&
                        w.p2pListStatus === 'listed' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              unlistForP2p.mutate(w._id);
                            }}
                            loading={unlistForP2p.isPending}
                          >
                            Unlist
                          </Button>
                        )}
                    </div>
                  </div>
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
                  <DetailRow
                    label="Platform Payment list"
                    value={
                      <span className="font-semibold">
                        {p2pLabel(detail)}
                        {detail.p2pListedBy ? ` · ${detail.p2pListedBy}` : ''}
                      </span>
                    }
                  />
                  <DetailRow label="Method" value={String(detail.method).toUpperCase()} />
                  <DetailRow label="Reference" value={detail.referenceId} />
                  <DetailRow label="User" value={user.name} />
                  <DetailRow label="Email" value={user.email || '—'} />
                  {user.phone ? <DetailRow label="Phone" value={user.phone} /> : null}
                  {user.externalRef ? (
                    <DetailRow label="External ref" value={user.externalRef} />
                  ) : null}
                  {user.businessUserCode ? (
                    <DetailRow label="User code" value={user.businessUserCode} />
                  ) : null}
                  {destinationRows(detail).map((row) => (
                    <DetailRow key={row.label} label={row.label} value={row.value} />
                  ))}
                  {detail.status === 'pending' && (detail.paidAmount || 0) <= 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(detail.p2pListStatus || 'awaiting') !== 'listed' ? (
                        <Button
                          className="flex-1"
                          loading={listForP2p.isPending}
                          onClick={() => listForP2p.mutate(detail._id)}
                        >
                              Approve
                        </Button>
                      ) : null}
                      <Button
                        className="flex-1"
                        variant="danger"
                        onClick={() => {
                          setActionError('');
                          setRejectReason('');
                          setRejectTarget(detail);
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                  {(detail.status === 'pending' || detail.status === 'processing') && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(detail.p2pListStatus || 'awaiting') !== 'listed' ? (
                        <Button
                          className="flex-1"
                          variant="secondary"
                          onClick={() => {
                            setActionError('');
                            setUtr('');
                            setTxHash('');
                            setApproveTarget(detail);
                          }}
                        >
                          Mark paid by business
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          variant="secondary"
                          loading={unlistForP2p.isPending}
                          onClick={() => unlistForP2p.mutate(detail._id)}
                        >
                          Unlist from Platform Payment
                        </Button>
                      )}
                    </div>
                  )}
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

      <Modal
        open={!!approveTarget}
        onClose={() => {
          setApproveTarget(null);
          setActionError('');
        }}
        title="Mark paid by business"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!approveTarget) return;
            setActionError('');
            approveMutation.mutate(approveTarget._id);
          }}
        >
          <p className="text-sm text-on-surface-variant">
            Use this only if your business paid the user directly. This marks the request{' '}
            <span className="font-semibold">Completed</span> — it will{' '}
            <span className="font-semibold">not</span> show on the investor Invest list.
            To let investors pay, use <span className="font-semibold">Approve</span> instead.
          </p>
          {approveTarget?.method !== 'usdt' ? (
            <Input
              label="UTR (optional)"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="UTR / RRN"
              maxLength={22}
            />
          ) : (
            <Input
              label="Tx Hash (optional)"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="Tx hash"
              maxLength={66}
            />
          )}
          {actionError && (
            <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              {actionError}
            </div>
          )}
          <Button type="submit" loading={approveMutation.isPending} className="w-full">
            Confirm paid
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setActionError('');
        }}
        title="Reject withdrawal"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rejectTarget || !rejectReason.trim()) return;
            setActionError('');
            rejectMutation.mutate({ id: rejectTarget._id, reason: rejectReason.trim() });
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
          <Button
            type="submit"
            variant="danger"
            loading={rejectMutation.isPending}
            className="w-full"
          >
            Confirm Reject
          </Button>
        </form>
      </Modal>
    </div>
  );
}
