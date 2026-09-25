'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { payLimitRequestsApi, type PayLimitRequest } from '../api/pay-limit-requests.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Status';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { liveQueryOptions } from '@/shared/constants/live-query';

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const PAGE_SIZES = [10, 20, 50];

function bizName(b: PayLimitRequest['businessId']) {
  if (!b) return 'â€”';
  if (typeof b === 'object') return b.name || b.slug || 'Business';
  return 'Business';
}

function personName(p: PayLimitRequest['requestedBy']) {
  if (!p) return 'â€”';
  if (typeof p === 'object') return p.name || p.email || 'â€”';
  return 'â€”';
}

function modeLabel(mode: string) {
  if (mode === 'add') return 'Add';
  if (mode === 'deduct') return 'Deduct';
  return 'Set absolute';
}

export function PayLimitRequestsPage() {
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<PayLimitRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  const listQuery = useMemo(
    () => ({ page, limit, status, search: search.trim() || undefined, sort: 'newest' }),
    [page, limit, status, search],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['pay-limit-requests', listQuery],
    queryFn: () => payLimitRequestsApi.list(listQuery),
    ...liveQueryOptions,
  });

  const approve = useMutation({
    mutationFn: (id: string) => payLimitRequestsApi.approve(id),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['pay-limit-requests'] });
      qc.invalidateQueries({ queryKey: ['businesses'] });
      qc.invalidateQueries({ queryKey: ['business-stats'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Approve failed')),
  });

  const reject = useMutation({
    mutationFn: () =>
      payLimitRequestsApi.reject(rejectTarget!._id, rejectReason.trim() || undefined),
    onSuccess: () => {
      setRejectTarget(null);
      setRejectReason('');
      setActionError('');
      qc.invalidateQueries({ queryKey: ['pay-limit-requests'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Reject failed')),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-on-surface sm:text-2xl">Pay limit requests</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Sub-admins request a seed change; admin approves before the limit is applied.
        </p>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                status === f.value
                  ? 'border-secondary bg-secondary-container font-semibold'
                  : 'border-outline-variant'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input
          label="Search business / notes"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Business name or notes"
        />
      </Card>

      {actionError ? (
        <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {actionError}
        </p>
      ) : null}

      {isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <EmptyState
          message={getApiErrorMessage(error, 'Could not load requests')}
          icon="error"
        />
      ) : !items.length ? (
        <EmptyState message="No pay-limit requests" icon="speed" />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r._id} className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-on-surface">{bizName(r.businessId)}</p>
                  <p className="text-xs text-on-surface-variant">
                    By {personName(r.requestedBy)} Â· {formatDate(r.createdAt)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-on-surface-variant">Action</p>
                  <p className="font-semibold">{modeLabel(r.mode)}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Amount</p>
                  <p className="font-semibold">{formatCurrency(r.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Seed at request</p>
                  <p className="font-semibold">{formatCurrency(r.seedAtRequest ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Notes</p>
                  <p className="font-medium">{r.notes || 'â€”'}</p>
                </div>
              </div>
              {r.status === 'rejected' && r.rejectReason ? (
                <p className="text-sm text-error">Reject reason: {r.rejectReason}</p>
              ) : null}
              {r.status === 'pending' && isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    loading={approve.isPending}
                    onClick={() => approve.mutate(r._id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectTarget(r);
                      setRejectReason('');
                    }}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
          <Pagination
            page={page}
            limit={limit}
            total={total}
            totalPages={Math.max(1, Math.ceil(total / limit))}
            onPageChange={setPage}
          />
        </div>
      )}

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject pay-limit request"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate();
          }}
        >
          <p className="text-sm text-on-surface-variant">
            {bizName(rejectTarget?.businessId)} â€” {formatCurrency(rejectTarget?.amount ?? 0)} (
            {modeLabel(rejectTarget?.mode || 'set')})
          </p>
          <Input
            label="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={reject.isPending}>
              Reject
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
