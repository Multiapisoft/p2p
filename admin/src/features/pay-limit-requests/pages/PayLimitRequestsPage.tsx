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
import { apiGet } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate, cn } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { liveQueryOptions } from '@/shared/constants/live-query';

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

type BizOption = {
  _id: string;
  name: string;
  referralCode?: string | null;
  status?: string;
  p2pPayLimit?: number;
};

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

function modeTone(mode: string) {
  if (mode === 'add') return 'bg-emerald-100 text-emerald-900';
  if (mode === 'deduct') return 'bg-amber-100 text-amber-950';
  return 'bg-surface-container-high text-on-surface';
}

export function PayLimitRequestsPage() {
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<PayLimitRequest | null>(null);
  const [approveTarget, setApproveTarget] = useState<PayLimitRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const [bizId, setBizId] = useState('');
  const [bizSearch, setBizSearch] = useState('');
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

  const {
    data: businesses = [],
    isLoading: businessesLoading,
    isError: businessesError,
    error: businessesErr,
  } = useQuery({
    queryKey: ['businesses-for-limit-request', isAdmin],
    queryFn: async (): Promise<BizOption[]> => {
      // Prefer admin options (all businesses, sorted by name) — not status-filtered.
      let options: BizOption[] = [];
      if (isAdmin) {
        try {
          const opts = await apiGet<BizOption[]>('/admin/business-options');
          if (Array.isArray(opts) && opts.length) {
            options = opts.map((b) => ({
              _id: b._id,
              name: b.name,
              referralCode: b.referralCode,
              status: b.status,
            }));
          }
        } catch {
          /* fall through */
        }
      }
      // Always pull /business for seed limits (and as fallback list).
      const pageRes = await businessesApi.list({
        page: 1,
        limit: 200,
        sort: 'newest',
      });
      const fromList = (pageRes.items ?? []).map((b) => ({
        _id: b._id,
        name: b.name,
        referralCode: b.referralCode ?? null,
        status: b.status,
        p2pPayLimit: b.p2pPayLimit,
      }));
      if (!options.length) return fromList;

      const seedById = new Map(fromList.map((b) => [b._id, b]));
      return options.map((o) => ({
        ...o,
        p2pPayLimit: seedById.get(o._id)?.p2pPayLimit ?? o.p2pPayLimit,
        status: o.status || seedById.get(o._id)?.status,
      }));
    },
    enabled: createOpen,
  });

  const filteredBusinesses = useMemo(() => {
    const q = bizSearch.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.referralCode || '').toLowerCase().includes(q),
    );
  }, [businesses, bizSearch]);

  const resetCreate = () => {
    setBizId('');
    setBizSearch('');
    setMode('add');
    setAmount('');
    setNotes('');
    setProofKey('');
    setProofUrl('');
    setProofPreview(null);
    setActionError('');
  };

  const approve = useMutation({
    mutationFn: () =>
      payLimitRequestsApi.approve(approveTarget!._id, reviewNotes.trim() || undefined),
    onSuccess: () => {
      setApproveTarget(null);
      setReviewNotes('');
      setActionError('');
      qc.invalidateQueries({ queryKey: ['pay-limit-requests'] });
      qc.invalidateQueries({ queryKey: ['businesses'] });
      qc.invalidateQueries({ queryKey: ['business-stats'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Approve failed')),
  });

  const reject = useMutation({
    mutationFn: () =>
      payLimitRequestsApi.reject(rejectTarget!._id, reviewNotes.trim() || undefined),
    onSuccess: () => {
      setRejectTarget(null);
      setReviewNotes('');
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
      if (!notes.trim()) throw new Error('Notes are required');
      return payLimitRequestsApi.create(bizId, {
        p2pPayLimit: num,
        mode,
        notes: notes.trim(),
        proofImageKey: proofKey || undefined,
        proofImageUrl: proofUrl || undefined,
        applyNow: applyNow && isAdmin ? true : undefined,
      });
    },
    onSuccess: (_data, applyNow) => {
      setCreateOpen(false);
      resetCreate();
      setActionError('');
      if (applyNow && isAdmin) {
        setStatus('approved');
        setPage(1);
        setActionSuccess('Pay limit applied and recorded.');
      } else {
        setStatus('pending');
        setPage(1);
        setActionSuccess('Pay-limit request submitted for approval.');
      }
      qc.invalidateQueries({ queryKey: ['pay-limit-requests'] });
      qc.invalidateQueries({ queryKey: ['businesses'] });
      qc.invalidateQueries({ queryKey: ['businesses-for-limit-request'] });
      qc.invalidateQueries({ queryKey: ['business-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-business-options'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not submit request')),
  });

  const submitCreate = (applyNow: boolean) => {
    setActionError('');
    setActionSuccess('');
    if (!bizId) {
      setActionError('Select a business first');
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setActionError('Enter an amount greater than 0');
      return;
    }
    if (!notes.trim()) {
      setActionError('Notes are required');
      return;
    }
    create.mutate(applyNow);
  };

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
  const pendingCount = status === 'pending' ? total : items.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Business quota
          </p>
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold text-on-surface sm:text-3xl">
            Pay limit requests
          </h1>
          <p className="mt-1 max-w-xl text-sm text-on-surface-variant">
            Add or deduct P2P pay limit for a business. Pending requests wait for admin approval.
          </p>
        </div>
        <Button
          className="shrink-0"
          onClick={() => {
            resetCreate();
            setActionSuccess('');
            setCreateOpen(true);
          }}
        >
          <span className="material-symbols-outlined mr-1 text-lg">add</span>
          {isAdmin ? 'Add limit' : 'Request limit'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="!p-0">
          <div className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
              <span className="material-symbols-outlined">pending_actions</span>
            </span>
            <div>
              <p className="text-xs font-medium text-on-surface-variant">Showing</p>
              <p className="text-lg font-bold tabular-nums">{total}</p>
            </div>
          </div>
        </Card>
        <Card className="!p-0">
          <div className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-container text-on-secondary-container">
              <span className="material-symbols-outlined">schedule</span>
            </span>
            <div>
              <p className="text-xs font-medium text-on-surface-variant">
                {status === 'pending' ? 'Pending in view' : 'Pending on page'}
              </p>
              <p className="text-lg font-bold tabular-nums">{pendingCount}</p>
            </div>
          </div>
        </Card>
        <Card className="!p-0">
          <div className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <span className="material-symbols-outlined">business_center</span>
            </span>
            <div>
              <p className="text-xs font-medium text-on-surface-variant">Filter</p>
              <p className="text-lg font-bold capitalize">{status}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Filters">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  status === f.value
                    ? 'border-secondary bg-secondary-container text-on-secondary-container'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            icon="search"
            label="Search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Business name or notes"
          />
        </div>
      </Card>

      {actionSuccess && !createOpen ? (
        <p className="rounded-xl border border-secondary/30 bg-secondary-container/40 px-3 py-2.5 text-sm font-medium text-on-surface">
          {actionSuccess}
        </p>
      ) : null}

      {actionError && !createOpen && !approveTarget && !rejectTarget ? (
        <p className="rounded-xl bg-error-container px-3 py-2.5 text-sm text-on-error-container">
          {actionError}
        </p>
      ) : null}

      {isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <EmptyState message={getApiErrorMessage(error, 'Could not load requests')} icon="error" />
      ) : !items.length ? (
        <Card>
          <EmptyState message="No pay-limit requests for this filter." icon="speed" />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r._id} className="!p-0 overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-low/40 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-bold text-on-surface">
                      {bizName(r.businessId)}
                    </p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        modeTone(r.mode),
                      )}
                    >
                      {modeLabel(r.mode)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    By {personName(r.requestedBy)} · {formatDate(r.createdAt)}
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

              <div className="grid grid-cols-2 gap-3 px-4 py-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
                    Amount
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-secondary">
                    {formatCurrency(r.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
                    Seed at request
                  </p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {formatCurrency(r.seedAtRequest ?? 0)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
                    Notes
                  </p>
                  <p className="mt-0.5 font-medium text-on-surface">{r.notes || '—'}</p>
                </div>
              </div>

              {r.proofImageUrl ? (
                <div className="px-4 pb-3">
                  <a
                    href={r.proofImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block overflow-hidden rounded-xl border border-outline-variant"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.proofImageUrl}
                      alt="Proof"
                      className="max-h-40 max-w-full object-contain"
                    />
                  </a>
                </div>
              ) : null}

              {r.status === 'approved' && r.reviewNotes ? (
                <p className="border-t border-outline-variant px-4 py-2.5 text-sm text-on-surface-variant">
                  Admin notes: {r.reviewNotes}
                </p>
              ) : null}
              {r.status === 'rejected' && (r.reviewNotes || r.rejectReason) ? (
                <p className="border-t border-outline-variant px-4 py-2.5 text-sm text-error">
                  Reject notes: {r.reviewNotes || r.rejectReason}
                </p>
              ) : null}

              {r.status === 'pending' && isAdmin ? (
                <div className="flex flex-wrap gap-2 border-t border-outline-variant bg-surface-container-low/30 px-4 py-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      setActionError('');
                      setReviewNotes('');
                      setApproveTarget(r);
                    }}
                  >
                    Approve & apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActionError('');
                      setReviewNotes('');
                      setRejectTarget(r);
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
        title={isAdmin ? 'Add pay limit' : 'Request pay limit'}
        className="sm:max-w-lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate(isAdmin);
          }}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold" htmlFor="limit-biz-search">
                Business
              </label>
              {!businessesLoading && businesses.length > 0 ? (
                <span className="text-[11px] font-medium text-on-surface-variant">
                  {filteredBusinesses.length} of {businesses.length}
                </span>
              ) : null}
            </div>
            <Input
              id="limit-biz-search"
              icon="search"
              value={bizSearch}
              onChange={(e) => setBizSearch(e.target.value)}
              placeholder="Search by name or code…"
            />
            {businessesLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-low/60 px-3 py-10 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                Loading businesses…
              </div>
            ) : businessesError ? (
              <p className="rounded-2xl bg-error-container px-3 py-2.5 text-sm text-on-error-container">
                {getApiErrorMessage(businessesErr, 'Could not load businesses')}
              </p>
            ) : !businesses.length ? (
              <div className="rounded-2xl border border-dashed border-outline-variant px-4 py-10 text-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
                  business_center
                </span>
                <p className="mt-2 text-sm text-on-surface-variant">
                  No businesses found. Create or approve a business first.
                </p>
              </div>
            ) : !filteredBusinesses.length ? (
              <p className="rounded-2xl border border-dashed border-outline-variant px-3 py-8 text-center text-sm text-on-surface-variant">
                No match for “{bizSearch}”.
              </p>
            ) : (
              <div
                role="listbox"
                aria-label="Businesses"
                className="custom-scrollbar max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-low/40 p-1.5"
              >
                {filteredBusinesses.map((b) => {
                  const selected = bizId === b._id;
                  const initial = (b.name || '?').trim().charAt(0).toUpperCase();
                  return (
                    <button
                      key={b._id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setBizId(b._id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all',
                        selected
                          ? 'bg-secondary-container shadow-sm ring-1 ring-secondary/40'
                          : 'hover:bg-surface-container-high',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                          selected
                            ? 'bg-secondary text-on-secondary'
                            : 'bg-primary/15 text-primary',
                        )}
                      >
                        {initial}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-on-surface">
                          {b.name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-on-surface-variant">
                          {b.referralCode ? (
                            <span className="truncate font-mono">{b.referralCode}</span>
                          ) : null}
                          {b.p2pPayLimit != null ? (
                            <span className="font-medium">
                              Seed {formatCurrency(b.p2pPayLimit)}
                            </span>
                          ) : null}
                          {b.status ? (
                            <span
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize',
                                b.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-surface-container-high text-on-surface-variant',
                              )}
                            >
                              {b.status}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'material-symbols-outlined shrink-0 text-xl',
                          selected ? 'text-secondary' : 'text-outline-variant',
                        )}
                      >
                        {selected ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {!bizId && businesses.length > 0 ? (
              <p className="text-[11px] text-on-surface-variant">Tap a business to select it.</p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Action</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'add', label: 'Add', icon: 'add_circle', hint: 'Increase seed limit' },
                  { value: 'deduct', label: 'Deduct', icon: 'do_not_disturb_on', hint: 'Decrease seed limit' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-left transition-colors',
                    mode === opt.value
                      ? 'border-secondary bg-secondary-container/40 ring-1 ring-secondary'
                      : 'border-outline-variant hover:bg-surface-container-high',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="material-symbols-outlined text-lg">{opt.icon}</span>
                    {opt.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-on-surface-variant">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <Input
            label={mode === 'add' ? 'Amount to add (₹)' : 'Amount to deduct (₹)'}
            type="number"
            min={0}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <Input
            label="Notes (required)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this limit change?"
            required
          />
          <p className="text-[11px] text-on-surface-variant">
            Admin and sub-admin must add a note for every limit change.
          </p>

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
              <span className="material-symbols-outlined mr-1 text-lg">upload</span>
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

          {actionError && createOpen ? (
            <p className="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">
              {actionError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-outline-variant pt-4 sm:flex-row sm:justify-end">
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
            <Button type="submit" loading={create.isPending} disabled={create.isPending}>
              {isAdmin ? 'Add & apply now' : 'Submit for approval'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!approveTarget}
        onClose={() => {
          setApproveTarget(null);
          setReviewNotes('');
          setActionError('');
        }}
        title="Approve request"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            approve.mutate();
          }}
        >
          <div className="rounded-xl border border-outline-variant bg-surface-container-low/50 px-3 py-3 text-sm">
            <p className="font-semibold">{bizName(approveTarget?.businessId)}</p>
            <p className="mt-1 text-on-surface-variant">
              {modeLabel(approveTarget?.mode || 'add')}{' '}
              <span className="font-bold text-secondary">
                {formatCurrency(approveTarget?.amount ?? 0)}
              </span>
            </p>
          </div>
          <Input
            label="Admin notes (optional)"
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Notes while approving"
          />
          {actionError && approveTarget ? (
            <p className="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">
              {actionError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setApproveTarget(null);
                setReviewNotes('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={approve.isPending}>
              Approve & apply limit
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setReviewNotes('');
          setActionError('');
        }}
        title="Reject request"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate();
          }}
        >
          <div className="rounded-xl border border-outline-variant bg-surface-container-low/50 px-3 py-3 text-sm">
            <p className="font-semibold">{bizName(rejectTarget?.businessId)}</p>
            <p className="mt-1 text-on-surface-variant">
              {modeLabel(rejectTarget?.mode || 'add')}{' '}
              <span className="font-bold">{formatCurrency(rejectTarget?.amount ?? 0)}</span>
            </p>
          </div>
          <Input
            label="Admin notes (optional)"
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Notes while rejecting"
          />
          {actionError && rejectTarget ? (
            <p className="rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">
              {actionError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setReviewNotes('');
              }}
            >
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
