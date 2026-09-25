'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { formatCurrency, formatDate, cn } from '@/shared/lib/utils';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import { resolveUser } from '@/shared/lib/entity-user';
import { BusinessWithdrawalForm } from '../components/BusinessWithdrawalForm';
import { AssignPayerModal } from '../components/AssignPayerModal';
import { WithdrawalOwnerPaymentsPanel } from '../components/WithdrawalOwnerPaymentsPanel';
import { supportApi } from '@/features/support/api/support.api';
import { businessDepositPayApi } from '@/features/deposits/api/business-deposit-pay.api';
import type { Withdrawal } from '@/shared/types/api.types';
import { liveQueryOptions } from '@/shared/constants/live-query';

function formatSecondsMmSs(total: number) {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

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

type MenuAction = {
  key: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
};

function RowActionsMenu({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: MenuAction[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuH = Math.min(actions.length * 40 + 8, 320);
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < menuH && r.top > menuH;
      setPos({
        top: openUp ? Math.max(8, r.top - menuH - 4) : r.bottom + 4,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  if (!actions.length) return null;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        aria-label="Actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-[20px]">more_vert</span>
      </button>
      {open && pos ? (
        <div
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-[100] max-h-80 min-w-[12rem] overflow-y-auto rounded-lg border border-outline-variant bg-surface py-1 shadow-lg"
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (a.disabled) return;
                onOpenChange(false);
                a.onClick();
              }}
              className={cn(
                'flex w-full flex-col items-start px-3 py-2 text-left text-sm font-medium transition-colors',
                a.disabled
                  ? 'cursor-not-allowed text-on-surface-variant/60'
                  : a.danger
                    ? 'text-error hover:bg-error-container/30'
                    : 'text-on-surface hover:bg-surface-container-high',
              )}
            >
              <span>{a.label}</span>
              {a.hint ? (
                <span className="text-[10px] font-normal text-on-surface-variant">{a.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WithdrawalsPage({
  origin = 'user',
  showCreateForm = false,
  title = 'Withdrawals',
}: {
  origin?: 'user' | 'business';
  showCreateForm?: boolean;
  title?: string;
} = {}) {
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
  const [proofKey, setProofKey] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofUploading, setProofUploading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [assignTarget, setAssignTarget] = useState<Withdrawal | null>(null);
  const [actionError, setActionError] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, status, method, sort, search, origin }),
    [page, limit, status, method, sort, search, origin],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['business-withdrawals', origin, listQuery],
    queryFn: () => withdrawalsApi.getBusinessWithdrawals(listQuery),
    ...liveQueryOptions,
  });

  const {
    data: detail,
    isLoading: loadingDetail,
    isError: detailError,
    error: detailErr,
    refetch: refetchDetail,
  } = useQuery({
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

  const setPriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: boolean }) =>
      withdrawalsApi.setPriority(id, priority),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
      qc.invalidateQueries({ queryKey: ['business-overview'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not update highlight')),
  });

  const assignPayer = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) =>
      withdrawalsApi.assignPayer(id, assigneeId),
    onSuccess: () => {
      setAssignTarget(null);
      setActionError('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Assign failed')),
  });

  const unassignPayer = useMutation({
    mutationFn: (id: string) => withdrawalsApi.unassignPayer(id),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Unassign failed')),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      withdrawalsApi.approve(id, {
        utr: utr.trim() || undefined,
        txHash: txHash.trim() || undefined,
        proofImageKey: proofKey || undefined,
        proofImageUrl: proofUrl || undefined,
      }),
    onSuccess: () => {
      setActionError('');
      setApproveTarget(null);
      setUtr('');
      setTxHash('');
      setProofKey('');
      setProofUrl('');
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

  const confirmReceived = useMutation({
    mutationFn: (paymentId: string) => withdrawalsApi.confirmPaymentReceived(paymentId),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not confirm payment')),
  });

  const raiseDispute = useMutation({
    mutationFn: ({
      paymentId,
      reason,
      attachments,
    }: {
      paymentId: string;
      reason?: string;
      attachments?: { key: string; publicUrl: string; filename: string }[];
    }) => withdrawalsApi.disputePayment(paymentId, reason, attachments),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-withdrawal'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not raise dispute')),
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
    if (w.origin === 'business' && s === 'awaiting') return 'Waiting admin verify';
    if (w.origin === 'business' && s === 'listed') return 'On pay list';
    if (s === 'listed') return 'Approved';
    if (s === 'over_limit') return 'Waiting admin (over limit)';
    if (s === 'rejected') return 'Approval rejected';
    return 'Awaiting approval';
  }

  function tatLeftSeconds(w: Withdrawal) {
    if (w.origin === 'business') return 0;
    if (w.userEditExpiresAt) {
      return Math.max(0, Math.ceil((new Date(w.userEditExpiresAt).getTime() - now) / 1000));
    }
    return Math.max(0, w.tatSecondsRemaining ?? 0);
  }

  function canApproveList(w: Withdrawal) {
    if (w.status !== 'pending' && w.status !== 'processing') return false;
    if ((w.paidAmount || 0) > 0) return false;
    if (w.origin === 'business') return false;
    if ((w.p2pListStatus || 'awaiting') === 'listed') return false;
    if (w.p2pListStatus === 'over_limit') return false;
    return tatLeftSeconds(w) <= 0;
  }

  function waitingTat(w: Withdrawal) {
    if (w.origin === 'business') return false;
    if ((w.p2pListStatus || 'awaiting') === 'listed') return false;
    if (w.status !== 'pending' && w.status !== 'processing') return false;
    return tatLeftSeconds(w) > 0;
  }

  function methodIcon(method: string) {
    if (method === 'upi') return 'qr_code_2';
    if (method === 'bank') return 'account_balance';
    if (method === 'usdt') return 'currency_bitcoin';
    return 'payments';
  }

  function statusAccent(status: string) {
    if (status === 'pending') return 'border-l-amber-500';
    if (status === 'processing') return 'border-l-sky-500';
    if (status === 'completed') return 'border-l-emerald-500';
    if (status === 'rejected' || status === 'cancelled' || status === 'failed') {
      return 'border-l-red-500';
    }
    return 'border-l-outline-variant';
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-low/40 to-secondary-container/20 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-secondary/10 blur-2xl" />
        <div className="relative">
          <PageHeader
            title={title}
            action={
              <CsvDownloadButton<Withdrawal>
                title={origin === 'business' ? 'My withdrawals' : 'User withdrawals'}
                filename={
                  origin === 'business'
                    ? 'business-my-withdrawals'
                    : 'business-user-withdrawals'
                }
                filters={{ Status: status, Method: method, Search: search, Sort: sort }}
                disabled={!data?.total}
                columns={[
                  { header: 'Reference', value: (w) => w.referenceId },
                  { header: 'Status', value: (w) => w.status },
                  { header: 'Method', value: (w) => w.method },
                  { header: 'Amount', value: (w) => w.amount },
                  { header: 'List status', value: (w) => w.p2pListStatus || '' },
                  { header: 'Assigned to', value: (w) => resolveUser(w.assignedTo).name },
                  { header: 'Created', value: (w) => w.createdAt },
                ]}
                fetchRows={() =>
                  fetchAllPages((page, limit) =>
                    withdrawalsApi.getBusinessWithdrawals({ ...listQuery, page, limit }),
                  )
                }
              />
            }
          />
        </div>
      </div>

      {showCreateForm ? <BusinessWithdrawalForm /> : null}

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
              placeholder="Search reference, user name, email, UPI…"
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
            <div className={`space-y-1.5 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((w) => {
                const user = resolveUser(w.userId);
                const remaining = Math.max(0, w.amount - (w.paidAmount || 0));
                const openRemaining = Math.max(
                  0,
                  w.amount - (w.paidAmount || 0) - (w.reservedAmount || 0),
                );
                const canManage = w.status === 'pending' || w.status === 'processing';
                const listStatus = w.p2pListStatus || 'awaiting';
                const dest = destinationLine(w);
                const assignee = resolveUser(w.assignedTo);

                const actions: MenuAction[] = [
                  {
                    key: 'details',
                    label: 'Details',
                    onClick: () => setSelectedId(w._id),
                  },
                ];

                if (canApproveList(w)) {
                  actions.push({
                    key: 'approve',
                    label: 'Approve',
                    onClick: () => listForP2p.mutate(w._id),
                  });
                } else if (waitingTat(w)) {
                  actions.push({
                    key: 'approve-wait',
                    label: 'Approve',
                    disabled: true,
                    hint: `User cancel ${formatSecondsMmSs(tatLeftSeconds(w))}`,
                    onClick: () => undefined,
                  });
                } else if (
                  w.status === 'pending' &&
                  (w.paidAmount || 0) <= 0 &&
                  w.origin !== 'business' &&
                  w.p2pListStatus === 'over_limit'
                ) {
                  actions.push({
                    key: 'over-limit',
                    label: 'Waiting admin (over limit)',
                    disabled: true,
                    onClick: () => undefined,
                  });
                }

                if (canManage && w.origin !== 'business' && remaining > 0) {
                  actions.push({
                    key: 'reject',
                    label: (w.paidAmount || 0) > 0 ? 'Reject remaining' : 'Reject',
                    danger: true,
                    onClick: () => {
                      setActionError('');
                      setRejectReason('');
                      setRejectTarget(w);
                    },
                  });
                }

                if (canManage && listStatus !== 'listed' && w.origin !== 'business') {
                  actions.push({
                    key: 'mark-paid',
                    label: 'Mark paid',
                    onClick: () => {
                      setActionError('');
                      setUtr('');
                      setTxHash('');
                      setProofKey('');
                      setProofUrl('');
                      setApproveTarget(w);
                    },
                  });
                }

                if (canManage && listStatus === 'listed') {
                  actions.push({
                    key: 'unlist',
                    label: 'Unlist',
                    onClick: () => unlistForP2p.mutate(w._id),
                  });
                }

                if (canManage) {
                  actions.push({
                    key: 'highlight',
                    label: w.priority ? 'Clear highlight' : 'Highlight',
                    onClick: () =>
                      setPriority.mutate({ id: w._id, priority: !w.priority }),
                  });
                }

                if (
                  canManage &&
                  openRemaining > 0 &&
                  (w.origin !== 'business' || listStatus === 'listed')
                ) {
                  actions.push({
                    key: 'assign',
                    label: assignee.id ? 'Reassign' : 'Assign',
                    onClick: () => {
                      setActionError('');
                      setAssignTarget(w);
                    },
                  });
                }

                if (assignee.id && canManage) {
                  actions.push({
                    key: 'unassign',
                    label: 'Unassign',
                    onClick: () => unassignPayer.mutate(w._id),
                  });
                }

                return (
                  <article
                    key={w._id}
                    className={cn(
                      'rounded-lg border border-outline-variant/80 border-l-[3px] bg-surface-container-lowest',
                      statusAccent(w.status),
                    )}
                  >
                    <div className="flex items-start gap-2 px-2 py-1.5 sm:items-center sm:px-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedId(w._id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-primary">
                            {methodIcon(w.method)}
                          </span>
                          <span className="text-[13px] font-bold tabular-nums text-error">
                            {formatCurrency(w.amount, w.currency)}
                          </span>
                          <StatusBadge status={w.status} />
                          {w.priority ? (
                            <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-bold uppercase text-amber-900">
                              Highlighted
                            </span>
                          ) : null}
                          {canManage && remaining > 0 ? (
                            <span
                              className={cn(
                                'rounded px-1 py-px text-[9px] font-semibold',
                                listStatus === 'listed'
                                  ? 'bg-secondary/15 text-secondary'
                                  : listStatus === 'rejected'
                                    ? 'bg-error/10 text-error'
                                    : 'bg-outline-variant/40 text-on-surface-variant',
                              )}
                            >
                              {p2pLabel(w)}
                            </span>
                          ) : null}
                          {(w.paidAmount || 0) > 0 ? (
                            <span className="text-[10px] text-secondary">
                              · Paid {formatCurrency(w.paidAmount || 0, w.currency)}
                              {remaining > 0
                                ? ` · Left ${formatCurrency(remaining, w.currency)}`
                                : ''}
                            </span>
                          ) : null}
                          {waitingTat(w) ? (
                            <span className="text-[10px] font-medium text-secondary">
                              · Cancel {formatSecondsMmSs(tatLeftSeconds(w))}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0 text-[10px] leading-snug text-on-surface-variant">
                          <span className="truncate font-mono font-medium text-primary">
                            {w.referenceId}
                          </span>
                          <span aria-hidden>·</span>
                          <span className="uppercase">{w.method}</span>
                          <span aria-hidden>·</span>
                          <span>{formatDate(w.createdAt)}</span>
                        </div>
                        <div className="mt-1 rounded-md border border-outline-variant/60 bg-surface-container-low/50 px-2 py-1 text-[11px] leading-snug">
                          <p className="truncate font-semibold text-on-surface">
                            {user.name || '—'}
                            {user.email ? (
                              <span className="font-normal text-on-surface-variant">
                                {' '}
                                · {user.email}
                              </span>
                            ) : null}
                            {user.businessUserCode ? (
                              <span className="font-normal text-on-surface-variant">
                                {' '}
                                · {user.businessUserCode}
                              </span>
                            ) : null}
                          </p>
                          {dest ? (
                            <p className="truncate text-on-surface-variant">{dest}</p>
                          ) : null}
                          {assignee.id ? (
                            <p className="truncate text-primary">
                              Assigned → {assignee.name}
                            </p>
                          ) : null}
                        </div>
                      </button>

                      <RowActionsMenu
                        open={menuOpenId === w._id}
                        onOpenChange={(open) => setMenuOpenId(open ? w._id : null)}
                        actions={actions}
                      />
                    </div>
                    {origin === 'business' && (w.payments?.length || 0) > 0 ? (
                      <div className="border-t border-outline-variant/60 px-2 py-2 sm:px-2.5">
                        <WithdrawalOwnerPaymentsPanel
                          payments={w.payments!}
                          currency={w.currency}
                          actionError={actionError}
                          onClearError={() => setActionError('')}
                          confirmingId={
                            confirmReceived.isPending ? confirmReceived.variables : null
                          }
                          disputing={raiseDispute.isPending}
                          onConfirm={(paymentId) => confirmReceived.mutate(paymentId)}
                          uploadAttachment={supportApi.uploadAttachment}
                          onDispute={(paymentId, reason, attachments) =>
                            raiseDispute.mutate({ paymentId, reason, attachments })
                          }
                        />
                      </div>
                    ) : null}
                  </article>
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
        {loadingDetail ? (
          <LoadingScreen />
        ) : detailError || !detail ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-on-surface-variant">
              {getApiErrorMessage(detailErr, 'Could not load withdrawal details')}
            </p>
            <Button type="button" size="sm" onClick={() => void refetchDetail()}>
              Retry
            </Button>
          </div>
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
                  {detail.status === 'pending' || detail.status === 'processing' ? (
                  <DetailRow
                    label="Platform Payment list"
                    value={
                      <span className="font-semibold">
                        {p2pLabel(detail)}
                        {detail.p2pListedBy ? ` · ${detail.p2pListedBy}` : ''}
                      </span>
                    }
                  />
                  ) : null}
                  {resolveUser(detail.assignedTo).id ? (
                    <DetailRow
                      label="Assigned payer"
                      value={`${resolveUser(detail.assignedTo).name}${
                        resolveUser(detail.assignedTo).email
                          ? ` · ${resolveUser(detail.assignedTo).email}`
                          : ''
                      }`}
                    />
                  ) : null}
                  <DetailRow label="Method" value={String(detail.method).toUpperCase()} />
                  <DetailRow label="Reference" value={detail.referenceId} />
                  <DetailRow label="User" value={user.name} />
                  <DetailRow label="Email" value={user.email || '—'} />
                  {user.externalRef ? (
                    <DetailRow label="External ref" value={user.externalRef} />
                  ) : null}
                  {user.businessUserCode ? (
                    <DetailRow label="User code" value={user.businessUserCode} />
                  ) : null}
                  {destinationRows(detail).map((row) => (
                    <DetailRow key={row.label} label={row.label} value={row.value} />
                  ))}
                  {detail.origin !== 'business' &&
                    detail.status === 'pending' &&
                    (detail.paidAmount || 0) <= 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {canApproveList(detail) ? (
                        <Button
                          className="flex-1"
                          loading={listForP2p.isPending}
                          onClick={() => listForP2p.mutate(detail._id)}
                        >
                              Approve
                        </Button>
                      ) : waitingTat(detail) ? (
                        <p className="w-full text-sm font-medium text-secondary">
                          User cancel window {formatSecondsMmSs(tatLeftSeconds(detail))} — Approve
                          unlocks after that.
                        </p>
                      ) : detail.p2pListStatus === 'over_limit' ? (
                        <p className="w-full text-sm font-medium text-amber-800">
                          Over remaining limit — waiting admin approval.
                          {detail.p2pListRejectReason
                            ? ` ${detail.p2pListRejectReason}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {detail.origin !== 'business' &&
                    (detail.status === 'pending' || detail.status === 'processing') &&
                    Math.max(0, detail.amount - (detail.paidAmount || 0)) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="flex-1"
                        variant="danger"
                        onClick={() => {
                          setActionError('');
                          setRejectReason('');
                          setRejectTarget(detail);
                        }}
                      >
                        {(detail.paidAmount || 0) > 0
                          ? 'Reject remaining'
                          : 'Reject'}
                      </Button>
                    </div>
                  )}
                  {detail.origin !== 'business' &&
                    (detail.status === 'pending' || detail.status === 'processing') && (
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
                  {(detail.status === 'pending' || detail.status === 'processing') &&
                  Math.max(
                    0,
                    detail.amount - (detail.paidAmount || 0) - (detail.reservedAmount || 0),
                  ) > 0 &&
                  (detail.origin !== 'business' || detail.p2pListStatus === 'listed') ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="flex-1"
                        variant="outline"
                        onClick={() => {
                          setActionError('');
                          setAssignTarget(detail);
                        }}
                      >
                        {resolveUser(detail.assignedTo).id ? 'Reassign' : 'Assign user'}
                      </Button>
                      {resolveUser(detail.assignedTo).id ? (
                        <Button
                          className="flex-1"
                          variant="ghost"
                          loading={unassignPayer.isPending}
                          onClick={() => unassignPayer.mutate(detail._id)}
                        >
                          Unassign
                        </Button>
                      ) : null}
                    </div>
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

                  {(detail.payments?.length || 0) > 0 &&
                    (origin === 'business' || detail.origin === 'business') && (
                    <div className="mt-4">
                      <WithdrawalOwnerPaymentsPanel
                        payments={detail.payments!}
                        currency={detail.currency}
                        actionError={actionError}
                        onClearError={() => setActionError('')}
                        confirmingId={
                          confirmReceived.isPending ? confirmReceived.variables : null
                        }
                        disputing={raiseDispute.isPending}
                        onConfirm={(paymentId) => confirmReceived.mutate(paymentId)}
                        uploadAttachment={supportApi.uploadAttachment}
                        onDispute={(paymentId, reason, attachments) =>
                          raiseDispute.mutate({ paymentId, reason, attachments })
                        }
                      />
                    </div>
                  )}

                  {(detail.payments?.length || 0) > 0 &&
                    origin !== 'business' &&
                    detail.origin !== 'business' && (
                    <div className="mt-4">
                      <p className="mb-2 text-sm font-semibold">
                        {(detail.payments?.length || 0) <= 1 ? 'Payment' : 'Payments'}
                      </p>
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
          <div>
            <p className="mb-1 text-sm font-semibold">Payment evidence (optional)</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="block w-full text-sm"
              disabled={proofUploading || approveMutation.isPending}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setProofUploading(true);
                setActionError('');
                try {
                  const uploaded = await businessDepositPayApi.uploadProof(
                    file,
                    'withdrawal-approve-proof',
                  );
                  setProofKey(uploaded.key);
                  setProofUrl(uploaded.publicUrl);
                } catch (err) {
                  setProofKey('');
                  setProofUrl('');
                  setActionError(err instanceof Error ? err.message : 'Upload failed');
                } finally {
                  setProofUploading(false);
                  e.target.value = '';
                }
              }}
            />
            {proofUploading ? (
              <p className="mt-1 text-xs text-on-surface-variant">Uploading…</p>
            ) : null}
            {proofUrl ? (
              <a
                href={proofUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block truncate text-xs font-semibold text-secondary hover:underline"
              >
                Evidence attached — view
              </a>
            ) : null}
          </div>
          {actionError && (
            <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              {actionError}
            </div>
          )}
          <Button type="submit" loading={approveMutation.isPending || proofUploading} className="w-full">
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
          {rejectTarget && (rejectTarget.paidAmount || 0) > 0 ? (
            <p className="text-sm text-on-surface-variant">
              Confirmed pays stay. Remaining{' '}
              <span className="font-semibold text-on-surface">
                {formatCurrency(
                  Math.max(0, rejectTarget.amount - (rejectTarget.paidAmount || 0)),
                  rejectTarget.currency,
                )}
              </span>{' '}
              is cancelled — unused pay-limit and fee are refunded to your business (fee also
              deducted from admin).
            </p>
          ) : null}
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

      <AssignPayerModal
        open={!!assignTarget}
        withdrawal={assignTarget}
        loading={assignPayer.isPending}
        error={actionError}
        onClose={() => setAssignTarget(null)}
        onAssign={(assigneeId) => assignPayer.mutate({ id: assignTarget!._id, assigneeId })}
      />
    </div>
  );
}
