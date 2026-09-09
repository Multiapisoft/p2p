'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { depositsApi } from '@/features/deposits/api/deposits.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { EmptyState, LoadingScreen } from '@/shared/components/ui/Icon';
import { Modal } from '@/shared/components/ui/Modal';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { liveQueryOptions } from '@/shared/constants/live-query';
import type { Deposit } from '@/shared/types/api.types';

function userLabel(d: Deposit) {
  const u = d.userId;
  if (!u || typeof u === 'string') return typeof u === 'string' ? u : '—';
  return u.name || u.email || u.businessUserCode || u.externalRef || 'User';
}

function businessLabel(b: Deposit['businessId']) {
  if (!b) return '—';
  if (typeof b === 'object') return b.name || b.slug || 'Business';
  return '—';
}

export function CdmRequestsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Deposit | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit: 20, status, search, method: 'cdm', sort: 'newest' }),
    [page, status, search],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-cdm-deposits', listQuery],
    queryFn: () =>
      status === 'pending'
        ? depositsApi.getPending(listQuery)
        : depositsApi.getAll(listQuery),
    ...liveQueryOptions,
  });

  const approve = useMutation({
    mutationFn: (id: string) => depositsApi.approve(id),
    onSuccess: () => {
      setSelected(null);
      setActionError('');
      qc.invalidateQueries({ queryKey: ['admin-cdm-deposits'] });
      qc.invalidateQueries({ queryKey: ['deposits'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not approve')),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      depositsApi.reject(id, reason),
    onSuccess: () => {
      setRejectOpen(false);
      setRejectReason('');
      setSelected(null);
      setActionError('');
      qc.invalidateQueries({ queryKey: ['admin-cdm-deposits'] });
      qc.invalidateQueries({ queryKey: ['deposits'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not reject')),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pendingHint = status === 'pending' ? total : null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-low/50 to-secondary-container/20 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-secondary/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
              <span className="material-symbols-outlined text-sm">atm</span>
              CDM
            </p>
            <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
              CDM Requests
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              All classic cash CDM deposit requests across businesses.
            </p>
          </div>
          {pendingHint != null && pendingHint > 0 ? (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-800">
              {pendingHint} pending
            </span>
          ) : null}
        </div>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Input
            className="min-w-0 flex-1 sm:min-w-[200px]"
            placeholder="Search ref, bank, user, business…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
            <p className="text-sm">{getApiErrorMessage(error, 'Could not load CDM requests')}</p>
            <Button type="button" className="mt-3" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState message="No CDM requests yet." />
        ) : (
          <div className={`overflow-x-auto ${isFetching ? 'opacity-70' : ''}`}>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant text-xs uppercase tracking-wide text-on-surface-variant">
                  <th className="px-2 py-2 font-semibold">User</th>
                  <th className="px-2 py-2 font-semibold">Business</th>
                  <th className="px-2 py-2 font-semibold">Amount</th>
                  <th className="px-2 py-2 font-semibold">Bank</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Created</th>
                  <th className="px-2 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d._id} className="border-b border-outline-variant/50">
                    <td className="px-2 py-2.5">
                      <p className="font-medium">{userLabel(d)}</p>
                      <p className="font-mono text-[10px] text-on-surface-variant">
                        {d.referenceId}
                      </p>
                    </td>
                    <td className="px-2 py-2.5">{businessLabel(d.businessId)}</td>
                    <td className="px-2 py-2.5 font-semibold">
                      {formatCurrency(d.amount, d.currency)}
                    </td>
                    <td className="px-2 py-2.5">{d.cdmDetails?.bankName || '—'}</td>
                    <td className="px-2 py-2.5">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-2 py-2.5 text-on-surface-variant">
                      {formatDate(d.createdAt)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(d)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={20}
            onPageChange={setPage}
          />
        ) : null}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setActionError('');
        }}
        title="CDM deposit request"
        className="sm:max-w-md"
      >
        {selected ? (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-xl bg-surface-container-low/60 p-3 text-sm">
              <p>
                <span className="text-on-surface-variant">Amount: </span>
                <span className="font-semibold">
                  {formatCurrency(selected.amount, selected.currency)}
                </span>
              </p>
              <p>
                <span className="text-on-surface-variant">Bank: </span>
                <span className="font-medium">{selected.cdmDetails?.bankName || '—'}</span>
              </p>
              {selected.cdmDetails?.payerName ? (
                <p>
                  <span className="text-on-surface-variant">Depositor: </span>
                  {selected.cdmDetails.payerName}
                </p>
              ) : null}
              {selected.cdmDetails?.locationHint ? (
                <p>
                  <span className="text-on-surface-variant">Location: </span>
                  {selected.cdmDetails.locationHint}
                </p>
              ) : null}
              {selected.cdmDetails?.notes ? (
                <p>
                  <span className="text-on-surface-variant">Notes: </span>
                  {selected.cdmDetails.notes}
                </p>
              ) : null}
              <p>
                <span className="text-on-surface-variant">User: </span>
                {userLabel(selected)}
              </p>
              <p>
                <span className="text-on-surface-variant">Business: </span>
                {businessLabel(selected.businessId)}
              </p>
              <p className="font-mono text-xs text-on-surface-variant">{selected.referenceId}</p>
              <StatusBadge status={selected.status} />
            </div>

            {actionError ? (
              <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {actionError}
              </p>
            ) : null}

            {selected.status === 'pending' ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRejectReason('');
                    setRejectOpen(true);
                  }}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  loading={approve.isPending}
                  onClick={() => approve.mutate(selected._id)}
                >
                  Approve & credit
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject CDM request"
        className="sm:max-w-md"
      >
        <div className="space-y-3">
          <Input
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this rejected?"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={reject.isPending}
              disabled={rejectReason.trim().length < 3}
              onClick={() => {
                if (!selected) return;
                reject.mutate({ id: selected._id, reason: rejectReason.trim() });
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
