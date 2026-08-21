'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { depositsApi } from '../api/deposits.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { normalizeUtr, normalizeTxHash, txHashError, utrError } from '@/shared/lib/validation';
import { asPerson, fetchAllPages, personCsvCells } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { PersonDetails } from '@/shared/components/PersonDetails';
import { InvestmentsTab } from '../components/InvestmentsTab';
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
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount high–low' },
  { value: 'amount_asc', label: 'Amount low–high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

function methodIcon(method: string) {
  if (method === 'upi') return 'qr_code';
  if (method === 'usdt') return 'currency_bitcoin';
  return 'account_balance';
}

export function DepositsPage() {
  const [tab, setTab] = useState<'deposits' | 'investments'>('deposits');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Deposits</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Review user deposits and investor investment requests. Platform Payment proofs are under
            Withdrawals → Split Payments.
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
              { header: 'User name', value: (d) => personCsvCells(d.userId)[0] },
              { header: 'User email', value: (d) => personCsvCells(d.userId)[1] },
              { header: 'User phone', value: (d) => personCsvCells(d.userId)[2] },
              { header: 'User role', value: (d) => personCsvCells(d.userId)[3] },
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

      <div className="chip-scroll">
        {(
          [
            { id: 'deposits', label: 'Deposits' },
            { id: 'investments', label: 'Investments' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:px-4 sm:py-2 sm:text-sm ${
              tab === t.id ? 'bg-primary text-on-primary' : 'border border-outline-variant'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'investments' ? (
        <InvestmentsTab />
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
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <EmptyState
            message={getApiErrorMessage(error, 'Failed to load deposits')}
            icon="error"
          />
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all' || method !== 'all'
                ? 'No deposits match your filters'
                : 'No classic deposits yet — Platform Payment proofs are in Withdrawals → Split Payments'
            }
            icon="south_west"
          />
        ) : (
          <>
            <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((d) => (
                <div
                  key={d._id}
                  className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-container-low sm:gap-3 sm:rounded-xl sm:p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-3 text-left sm:gap-4"
                    onClick={() => setDetailId(d._id)}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-container/20 text-secondary sm:h-10 sm:w-10">
                      <span className="material-symbols-outlined text-[20px] sm:text-[24px]">
                        {methodIcon(d.method)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{d.referenceId}</p>
                      <p className="text-xs text-on-surface-variant sm:text-sm">
                        {d.method.toUpperCase()} • {formatDate(d.createdAt)}
                      </p>
                      {asPerson(d.userId)?.name || asPerson(d.userId)?.email ? (
                        <p className="mt-0.5 text-[11px] text-on-surface-variant sm:text-xs">
                          User: {asPerson(d.userId)?.name || '—'}
                          {asPerson(d.userId)?.role ? ` · ${asPerson(d.userId)?.role}` : ''}
                          {asPerson(d.userId)?.email ? ` · ${asPerson(d.userId)?.email}` : ''}
                        </p>
                      ) : null}
                    </div>
                  </button>
                  <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
                    <div className="text-left sm:text-right">
                      <p className="font-[family-name:var(--font-headline)] text-base font-semibold text-secondary sm:text-lg">
                        {formatCurrency(d.amount, d.currency)}
                      </p>
                      <StatusBadge status={d.status} />
                    </div>
                    {d.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setApproveTarget(d)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRejectTarget(d)}>
                          Reject
                        </Button>
                      </div>
                    )}
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
            {approveTarget?.referenceId} — {formatCurrency(approveTarget?.amount ?? 0, approveTarget?.currency)}
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

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title="Deposit Details" className="sm:max-w-2xl">
        {detailLoading ? (
          <LoadingScreen />
        ) : depositDetail ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-on-surface-variant">Reference:</span> {depositDetail.referenceId}
            </p>
            <p>
              <span className="text-on-surface-variant">Amount:</span>{' '}
              {formatCurrency(depositDetail.amount, depositDetail.currency)}
            </p>
            {(depositDetail.commissionAmount || 0) > 0 && (
              <p>
                <span className="text-on-surface-variant">Commission cut:</span>{' '}
                <span className="font-semibold text-error">
                  −{formatCurrency(depositDetail.commissionAmount!, depositDetail.currency)}
                </span>
              </p>
            )}
            <p>
              <span className="text-on-surface-variant">Method:</span> {depositDetail.method.toUpperCase()}
            </p>
            <p>
              <span className="text-on-surface-variant">Status:</span>{' '}
              <StatusBadge status={depositDetail.status} />
            </p>
            <PersonDetails title="User" person={depositDetail.userId} />
            <p>
              <span className="text-on-surface-variant">Created:</span> {formatDate(depositDetail.createdAt)}
            </p>
          </div>
        ) : null}
      </Modal>
      </>
      )}
    </div>
  );
}
