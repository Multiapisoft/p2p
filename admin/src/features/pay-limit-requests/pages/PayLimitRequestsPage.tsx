'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  payLimitRequestsApi,
  type PayLimitMode,
  type PayLimitRequest,
} from '../api/pay-limit-requests.api';
import { businessesApi } from '@/features/businesses/api/businesses.api';
import { adminDepositPayApi } from '@/features/deposits/api/admin-deposit-pay.api';
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

function bizName(b: PayLimitRequest['businessId']) {
  if (!b) return '—';
  if (typeof b === 'object') return b.name || b.slug || 'Business';
  return 'Business';
}

function personName(p: PayLimitRequest['requestedBy']) {
  if (!p) return '—';
  if (typeof p === 'object') return p.name || p.email || '—';
  return '—';
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
  const [limit] = useState(20);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<PayLimitRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const [bizId, setBizId] = useState('');
  const [mode, setMode] = useState<PayLimitMode>('add');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [proofKey, setProofKey] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const listQuery = useMemo(
    () => ({ page, limit, status, search: search.trim() || undefined, sort: 'newest' }),
    [page, limit, status, search],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['pay-limit-requests', listQuery],
    queryFn: () => payLimitRequestsApi.list(listQuery),
    ...liveQueryOptions,
  });

  const { data: businessesData } = useQuery({
    queryKey: ['businesses-for-limit-request'],
    queryFn: () => businessesApi.list({ page: 1, limit: 200, status: 'active', sort: 'newest' }),
    enabled: createOpen,
  });

  const resetCreate = () => {
    setBizId('');
    setMode('add');
    setAmount('');
    setNotes('');
    setProofKey('');
    setProofUrl('');
    setProofPreview(null);
    setActionError('');
  };

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

  const create = useMutation({
    mutationFn: async (applyNow: boolean) => {
      const num = Number(amount);
      if (!bizId) throw new Error('Select a business');
      if (!Number.isFinite(num) || num < 0) throw new Error('Enter a valid amount');
      if ((mode === 'add' || mode === 'deduct') && num <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      return payLimitRequestsApi.create(bizId, {
        p2pPayLimit: num,
        mode,
        notes: notes.trim() || undefined,
        proofImageKey: proofKey || undefined,
        proofImageUrl: proofUrl || undefined,
        applyNow: applyNow && isAdmin ? true : undefined,
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      resetCreate();
      qc.invalidateQueries({ queryKey: ['pay-limit-requests'] });
      qc.invalidateQueries({ queryKey: ['businesses'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not submit request')),
  });

  const handleProof = async (file: File) => {
    setActionError('');
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setActionError('Only JPG/PNG/WEBP images allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionError('Image must be smaller than 5MB');
      return;
    }
    setUploading(true);
    try {
      setProofPreview(URL.createObjectURL(file));
      const uploaded = await adminDepositPayApi.uploadProof(file, 'p2p-limit-proof');
      setProofKey(uploaded.key);
      setProofUrl(uploaded.publicUrl);
    } catch (err: unknown) {
      setProofPreview(null);
      setActionError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const businesses = businessesData?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface sm:text-2xl">Pay limit requests</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Sub-admin submits request with notes/proof. Admin verifies and approves — then business
            limit is applied. Full history keeps who created each request.
          </p>
        </div>
        <Button
          onClick={() => {
            resetCreate();
            setCreateOpen(true);
          }}
        >
          {isAdmin ? 'Add / request limit' : 'Request limit'}
        </Button>
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
        <EmptyState message={getApiErrorMessage(error, 'Could not load requests')} icon="error" />
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
                    Created by {personName(r.requestedBy)} · {formatDate(r.createdAt)}
                  </p>
                  {r.reviewedBy ? (
                    <p className="text-xs text-on-surface-variant">
                      Reviewed by {personName(r.reviewedBy)}
                      {r.reviewedAt ? ` · ${formatDate(r.reviewedAt)}` : ''}
                    </p>
                  ) : null}
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
                  <p className="font-medium">{r.notes || '—'}</p>
                </div>
              </div>
              {r.proofImageUrl ? (
                <a
                  href={r.proofImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block overflow-hidden rounded-lg border border-outline-variant"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.proofImageUrl}
                    alt="Proof"
                    className="max-h-40 max-w-full object-contain"
                  />
                </a>
              ) : null}
              {r.status === 'rejected' && r.rejectReason ? (
                <p className="text-sm text-error">Reject reason: {r.rejectReason}</p>
              ) : null}
              {r.status === 'pending' && isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(r._id)}>
                    Approve & apply limit
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
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreate();
        }}
        title={isAdmin ? 'Add / request pay limit' : 'Request pay limit'}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(false);
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="limit-biz">
              Business
            </label>
            <select
              id="limit-biz"
              className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm"
              value={bizId}
              onChange={(e) => setBizId(e.target.value)}
              required
            >
              <option value="">Select business</option>
              {businesses.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name} (seed {formatCurrency(b.p2pPayLimit ?? 0)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Action</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: 'set', label: 'Set absolute' },
                  { value: 'add', label: 'Add' },
                  { value: 'deduct', label: 'Deduct' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    mode === opt.value
                      ? 'border-secondary bg-secondary-container font-semibold'
                      : 'border-outline-variant'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label={
              mode === 'set'
                ? 'Seed pay limit (₹)'
                : mode === 'add'
                  ? 'Amount to add (₹)'
                  : 'Amount to deduct (₹)'
            }
            type="number"
            min={0}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this limit change?"
          />

          <div className="space-y-2">
            <p className="text-sm font-semibold">Proof (optional)</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleProof(f);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              Upload proof image
            </Button>
            {proofPreview || proofUrl ? (
              <div className="overflow-hidden rounded-xl border border-outline-variant">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofPreview || proofUrl}
                  alt="Proof preview"
                  className="max-h-48 w-full object-contain"
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetCreate();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending && !create.variables}>
              Submit for approval
            </Button>
            {isAdmin ? (
              <Button
                type="button"
                loading={create.isPending && !!create.variables}
                onClick={() => create.mutate(true)}
              >
                Add & apply now
              </Button>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject request">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate();
          }}
        >
          <p className="text-sm text-on-surface-variant">
            {bizName(rejectTarget?.businessId)} — {formatCurrency(rejectTarget?.amount ?? 0)} (
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
