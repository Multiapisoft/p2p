'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { businessesApi } from '../api/businesses.api';
import { commissionsApi } from '@/features/commissions/api/commissions.api';
import {
  CommissionRulesEditor,
  emptyRule,
  rulesFromConfigs,
} from '../components/CommissionRulesEditor';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/State';
import { formatCurrency, cn } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { fetchAllPages } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import {
  authImpersonateApi,
  openImpersonateSession,
} from '@/features/auth/api/impersonate.api';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import type { Business, CommissionRuleInput } from '@/shared/types/api.types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Status' },
  { value: 'amount_desc', label: 'Deposits: high to low' },
  { value: 'amount_asc', label: 'Deposits: low to high' },
];

const PAGE_SIZES = [5, 10, 20];

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
  { value: 'cdm', label: 'CDM' },
];

function toggleMethod(list: string[], value: string, checked: boolean) {
  if (checked) return list.includes(value) ? list : [...list, value];
  return list.filter((m) => m !== value);
}

type MenuAction = {
  key: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
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
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
                a.onClick();
              }}
              className={cn(
                'flex w-full items-center px-3 py-2 text-left text-sm font-medium transition-colors',
                a.danger
                  ? 'text-error hover:bg-error-container/30'
                  : 'text-on-surface hover:bg-surface-container-high',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function statusAccent(status: string) {
  switch (status) {
    case 'active':
      return 'border-l-emerald-500';
    case 'pending':
      return 'border-l-amber-500';
    case 'suspended':
      return 'border-l-red-500';
    default:
      return 'border-l-outline-variant';
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'B';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function MetricChip({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-outline-variant/60 bg-surface-container-low/60 px-2 py-1">
      <p className="text-[9px] font-bold uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
      <p className="text-[12px] font-semibold tabular-nums text-on-surface">{value}</p>
      {sub ? <p className="text-[10px] text-on-surface-variant">{sub}</p> : null}
    </div>
  );
}

export function BusinessesPage() {
  const { has } = usePermissions();
  const canLoginAsBusiness = has(PERMISSIONS.LOGIN_AS_BUSINESS);
  const [statsTarget, setStatsTarget] = useState<Business | null>(null);
  const [highlightTarget, setHighlightTarget] = useState<Business | null>(null);
  const [highlightDraft, setHighlightDraft] = useState('0');
  const [highlightError, setHighlightError] = useState('');
  const [commissionTarget, setCommissionTarget] = useState<Business | null>(null);
  const [txnFlagsTarget, setTxnFlagsTarget] = useState<Business | null>(null);
  const [txnFlagsError, setTxnFlagsError] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [businessTakeDeposit, setBusinessTakeDeposit] = useState<CommissionRuleInput[]>([
    emptyRule({ percentage: 2 }),
  ]);
  const [businessTakeWithdrawal, setBusinessTakeWithdrawal] = useState<CommissionRuleInput[]>([
    emptyRule({ percentage: 2 }),
  ]);
  const [investorBonus, setInvestorBonus] = useState<CommissionRuleInput[]>([
    emptyRule({ percentage: 1, feeMode: 'percentage' }),
  ]);
  const [p2pPayLimit, setP2pPayLimit] = useState('0');
  const [usdtBuyInrRate, setUsdtBuyInrRate] = useState('');
  const [usdtSellInrRate, setUsdtSellInrRate] = useState('');
  const [commissionError, setCommissionError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, status, sort, search }),
    [page, limit, status, sort, search],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['businesses', listQuery],
    queryFn: () => businessesApi.list(listQuery),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['business-stats', statsTarget?._id],
    queryFn: () => businessesApi.getStats(statsTarget!._id),
    enabled: !!statsTarget,
  });


  const { data: businessCommission, isLoading: loadingCommission } = useQuery({
    queryKey: ['business-commission', commissionTarget?._id],
    queryFn: () => commissionsApi.getBusiness(commissionTarget!._id),
    enabled: !!commissionTarget,
  });

  useEffect(() => {
    if (!commissionTarget || !businessCommission) return;
    setBusinessTakeDeposit(
      rulesFromConfigs(
        businessCommission.businessTakeDeposit?.length
          ? businessCommission.businessTakeDeposit
          : businessCommission.businessTake,
      ),
    );
    setBusinessTakeWithdrawal(
      rulesFromConfigs(
        businessCommission.businessTakeWithdrawal?.length
          ? businessCommission.businessTakeWithdrawal
          : businessCommission.businessTake,
      ),
    );
    setInvestorBonus(rulesFromConfigs(businessCommission.investorBonus));
    setP2pPayLimit(String(businessCommission.p2pPayLimit ?? 0));
    setUsdtBuyInrRate(
      commissionTarget.usdtBuyInrRate && commissionTarget.usdtBuyInrRate > 0
        ? String(commissionTarget.usdtBuyInrRate)
        : '',
    );
    setUsdtSellInrRate(
      commissionTarget.usdtSellInrRate && commissionTarget.usdtSellInrRate > 0
        ? String(commissionTarget.usdtSellInrRate)
        : '',
    );
    setCommissionError('');
  }, [commissionTarget, businessCommission]);


  const approve = useMutation({
    mutationFn: (id: string) => businessesApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['businesses'] }),
  });

  const saveHighlight = useMutation({
    mutationFn: async () => {
      const hl = Number(highlightDraft);
      if (!Number.isFinite(hl) || hl < 0 || !Number.isInteger(hl)) {
        throw new Error('Highlight limit must be a whole number ≥ 0');
      }
      return businessesApi.setHighlightLimit(highlightTarget!._id, hl);
    },
    onSuccess: () => {
      setHighlightTarget(null);
      setHighlightError('');
      qc.invalidateQueries({ queryKey: ['businesses'] });
      qc.invalidateQueries({ queryKey: ['business-stats'] });
    },
    onError: (err) => setHighlightError(getApiErrorMessage(err, 'Could not save highlight limit')),
  });

  const loginAsBusiness = useMutation({
    mutationFn: (businessId: string) => authImpersonateApi.asBusiness(businessId),
    onSuccess: (data) => openImpersonateSession(data),
  });

  const saveTxnFlags = useMutation({
    mutationFn: (body: {
      depositsEnabled: boolean;
      withdrawalsEnabled: boolean;
      b2bMatchingEnabled: boolean;
      allowPartialPayMode: 'inherit' | 'on' | 'off';
      minPartialPayInr?: number;
      allowMobileNumberUpiMode: 'inherit' | 'on' | 'off';
      allowedDepositMethods: string[];
      allowedWithdrawalMethods: string[];
    }) => businessesApi.update(txnFlagsTarget!._id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['businesses'] });
      setTxnFlagsError('');
      setTxnFlagsTarget(null);
    },
    onError: (err) => {
      setTxnFlagsError(getApiErrorMessage(err, 'Could not save txn flags'));
    },
  });

  const saveCommissions = useMutation({
    mutationFn: async () => {
      const buy = usdtBuyInrRate.trim() === '' ? 0 : Number(usdtBuyInrRate);
      const sell = usdtSellInrRate.trim() === '' ? 0 : Number(usdtSellInrRate);
      if (!Number.isFinite(buy) || buy < 0 || !Number.isFinite(sell) || sell < 0) {
        throw new Error('USDT rates must be empty (platform default) or ≥ 0');
      }
      await businessesApi.updateAdmin(commissionTarget!._id, {
        usdtBuyInrRate: buy,
        usdtSellInrRate: sell,
      });
      return commissionsApi.upsertBusiness(commissionTarget!._id, {
        businessTakeDeposit,
        businessTakeWithdrawal,
        investorBonus,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-commission'] });
      qc.invalidateQueries({ queryKey: ['business-stats'] });
      qc.invalidateQueries({ queryKey: ['businesses'] });
      qc.invalidateQueries({ queryKey: ['commissions'] });
      setCommissionTarget(null);
    },
    onError: (err: unknown) => {
      const ax = err as {
        response?: { status?: number; data?: { message?: string | string[] }; statusText?: string };
        message?: string;
      };
      const msg = ax.response?.data?.message;
      const fallback =
        ax.response?.status === 404
          ? 'Commission API not found — restart backend (POST /commissions/business/:id)'
          : ax.message || 'Failed to save commissions';
      setCommissionError(Array.isArray(msg) ? msg.join(', ') : msg || fallback);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pendingOnPage = items.filter((b) => b.status === 'pending').length;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Businesses</h1>
        </div>
        <CsvDownloadButton<Business>
          title="Businesses"
          filename={`businesses-${status}`}
          filters={{ Status: status, Search: search, Sort: sort }}
          disabled={!total}
          columns={[
            { header: 'Name', value: (b) => b.name },
            { header: 'Slug', value: (b) => b.slug },
            { header: 'Status', value: (b) => b.status },
            { header: 'Total deposits', value: (b) => b.totalDeposits },
            { header: 'Total users', value: (b) => b.totalUsers },
            { header: 'Commission rate', value: (b) => b.commissionRate },
              { header: 'Pay limit', value: (b) => b.p2pPayLimit ?? '' },
              { header: 'Remaining', value: (b) => b.p2pPayRemaining ?? '' },
            { header: 'Created', value: (b) => b.createdAt },
          ]}
          fetchRows={() =>
            fetchAllPages((p, l) => businessesApi.list({ ...listQuery, page: p, limit: l }))
          }
        />
      </div>

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
            Pending here
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{pendingOnPage}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search name, slug…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
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
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
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
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm ${
                  status === s.value ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No businesses match your filters" icon="business_center" />
        ) : (
          <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((b) => {
              const actions: MenuAction[] = [
                {
                  key: 'stats',
                  label: 'View Stats',
                  onClick: () => setStatsTarget(b),
                },
                {
                  key: 'commissions',
                  label: 'Commissions',
                  onClick: () => setCommissionTarget(b),
                },
                {
                  key: 'txn-flags',
                  label: 'Txn flags',
                  onClick: () => setTxnFlagsTarget(b),
                },
                {
                  key: 'highlight',
                  label: 'Highlight limit',
                  onClick: () => {
                    setHighlightDraft(String(b.highlightLimitPerMonth ?? 0));
                    setHighlightError('');
                    setHighlightTarget(b);
                  },
                },
              ];
              if (b.status === 'active' && canLoginAsBusiness) {
                actions.push({
                  key: 'login',
                  label: 'Login as business',
                  onClick: () => loginAsBusiness.mutate(b._id),
                });
              }
              if (b.status === 'pending') {
                actions.push({
                  key: 'approve',
                  label: 'Approve',
                  onClick: () => approve.mutate(b._id),
                });
              }

              return (
                <article
                  key={b._id}
                  className={cn(
                    'rounded-xl border border-outline-variant/70 border-l-[3px] bg-surface-container-lowest px-3 py-2.5 transition hover:border-secondary/40 hover:shadow-sm',
                    statusAccent(b.status),
                  )}
                >
                  <div className="flex items-start gap-2.5 sm:items-center">
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                        b.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-800'
                          : b.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-900'
                            : b.status === 'suspended'
                              ? 'bg-error/10 text-error'
                              : 'bg-primary/10 text-primary',
                      )}
                      aria-hidden
                    >
                      {initials(b.name)}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate text-sm font-bold tracking-tight text-on-surface">
                          {b.name}
                        </h3>
                        <StatusBadge status={b.status} />
                        <span className="truncate rounded bg-surface-container-high px-1.5 py-px font-mono text-[10px] text-on-surface-variant">
                          /{b.slug}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
                        <MetricChip
                          label="Deposits"
                          value={formatCurrency(b.totalDeposits)}
                        />
                        <MetricChip label="Users" value={b.totalUsers} />
                        <MetricChip label="Commission" value={`${b.commissionRate ?? 0}%`} />
                        <MetricChip
                          label="Pay limit"
                          value={formatCurrency(b.p2pPayLimit ?? 0)}
                          sub={`Left ${formatCurrency(b.p2pPayRemaining ?? 0)}`}
                        />
                        <MetricChip
                          label="Highlight / mo"
                          value={b.highlightLimitPerMonth ?? 0}
                          sub={`Left ${b.highlightRemainingThisMonth ?? 0}`}
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {b.status === 'pending' ? (
                        <Button
                          size="sm"
                          className="!h-8 !min-h-0 !px-2.5 !py-0 text-[11px]"
                          loading={approve.isPending}
                          onClick={() => approve.mutate(b._id)}
                        >
                          Approve
                        </Button>
                      ) : null}
                      {b.status === 'active' && canLoginAsBusiness ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="!h-8 !min-h-0 !px-2.5 !py-0 text-[11px] hidden sm:inline-flex"
                          loading={loginAsBusiness.isPending}
                          onClick={() => loginAsBusiness.mutate(b._id)}
                        >
                          Login
                        </Button>
                      ) : null}
                      <RowActionsMenu
                        open={menuOpenId === b._id}
                        onOpenChange={(open) => setMenuOpenId(open ? b._id : null)}
                        actions={actions}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
            <div className="pt-1">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={!!highlightTarget}
        onClose={() => {
          setHighlightTarget(null);
          setHighlightError('');
        }}
        title={`Monthly highlight limit — ${highlightTarget?.name ?? ''}`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setHighlightError('');
            saveHighlight.mutate();
          }}
        >
          <p className="text-sm text-on-surface-variant">
            Monthly pin quota for pay lists. 0 = highlighting off.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-on-surface-variant">Used this month</p>
              <p className="font-semibold">{highlightTarget?.highlightUsedThisMonth ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Remaining</p>
              <p className="font-semibold">
                {highlightTarget?.highlightRemainingThisMonth ?? 0}
              </p>
            </div>
          </div>
          <Input
            label="Highlights per month"
            type="number"
            min={0}
            step="1"
            value={highlightDraft}
            onChange={(e) => setHighlightDraft(e.target.value)}
            required
          />
          {highlightError ? (
            <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
              {highlightError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setHighlightTarget(null);
                setHighlightError('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saveHighlight.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!statsTarget} onClose={() => setStatsTarget(null)} title={`${statsTarget?.name} Stats`}>
        {loadingStats ? (
          <LoadingScreen />
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-on-surface-variant">Total Deposits</p>
              <p className="text-lg font-bold">{formatCurrency(stats.totalDeposits)}</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Total Withdrawals</p>
              <p className="text-lg font-bold">{formatCurrency(stats.totalWithdrawals)}</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Users</p>
              <p className="font-semibold">{stats.totalUsers}</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Commission Earned</p>
              <p className="font-semibold">{formatCurrency(stats.totalCommissionEarned)}</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Commission Rate</p>
              <p className="font-semibold">{stats.commissionRate}%</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Platform Pay Limit</p>
              <p className="font-semibold">
                {formatCurrency(stats.p2pPayCap ?? (stats.p2pPayLimit ?? 0) + (stats.p2pPayEarned ?? 0))}
              </p>
            </div>
            <div>
              <p className="text-on-surface-variant">From deposits</p>
              <p className="font-semibold">{formatCurrency(stats.p2pPayEarned ?? 0)}</p>
            </div>
            <div>
              <p className="text-on-surface-variant">Platform Payment Used</p>
              <p className="font-semibold">{formatCurrency(stats.p2pPayUsed ?? 0)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-on-surface-variant">Platform Payment Remaining</p>
              <p className="text-lg font-bold">
                {formatCurrency(stats.p2pPayRemaining ?? 0)}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!commissionTarget}
        onClose={() => setCommissionTarget(null)}
        title={`Commissions — ${commissionTarget?.name ?? ''}`}
        className="sm:max-w-2xl"
      >
        {loadingCommission ? (
          <LoadingScreen />
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-on-surface-variant">
              Fees cut from business wallet; investor bonus from admin wallet.
            </p>

            <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low/40 p-3">
              <p className="text-sm font-semibold">Platform Payment pay limit (₹)</p>
              <p className="text-xs text-on-surface-variant">
                Earned: {formatCurrency(businessCommission?.p2pPayEarned ?? 0)} · Used:{' '}
                {formatCurrency(businessCommission?.p2pPayUsed ?? 0)}
                {` · Remaining: ${formatCurrency(businessCommission?.p2pPayRemaining ?? 0)}`}
              </p>
              <p className="text-sm font-semibold">
                {formatCurrency(Number(p2pPayLimit) || 0)}{' '}
                <span className="text-xs font-normal text-on-surface-variant">
                  (change via Limit Requests)
                </span>
              </p>
            </div>

            <div className="grid gap-3 rounded-xl border border-outline-variant bg-surface-container-low/40 p-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="usdt-buy-rate">
                  USDT buy rate (INR / USDT)
                </label>
                <p className="text-xs text-on-surface-variant">
                  Admin-only. Empty = platform default. Used for INR → USDT conversion.
                </p>
                <Input
                  id="usdt-buy-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Platform default"
                  value={usdtBuyInrRate}
                  onChange={(e) => setUsdtBuyInrRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold" htmlFor="usdt-sell-rate">
                  USDT sell rate (INR / USDT)
                </label>
                <p className="text-xs text-on-surface-variant">
                  Admin-only. Empty = platform default. Used for USDT → INR value.
                </p>
                <Input
                  id="usdt-sell-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Platform default"
                  value={usdtSellInrRate}
                  onChange={(e) => setUsdtSellInrRate(e.target.value)}
                />
              </div>
            </div>

            <CommissionRulesEditor
              title="Business fee — Deposit"
              rules={businessTakeDeposit}
              onChange={setBusinessTakeDeposit}
            />

            <CommissionRulesEditor
              title="Business fee — Withdrawal / P2P pay"
              rules={businessTakeWithdrawal}
              onChange={setBusinessTakeWithdrawal}
            />

            <CommissionRulesEditor
              title="Investor bonus (extra credit)"
              rules={investorBonus}
              onChange={setInvestorBonus}
            />

            {commissionError && (
              <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {commissionError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setCommissionTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                loading={saveCommissions.isPending}
                onClick={() => {
                  setCommissionError('');
                  saveCommissions.mutate();
                }}
              >
                Save limit & commissions
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!txnFlagsTarget}
        onClose={() => {
          setTxnFlagsError('');
          setTxnFlagsTarget(null);
        }}
        title={`Txn flags — ${txnFlagsTarget?.name ?? ''}`}
      >
        {txnFlagsTarget ? (
          <div className="space-y-4">
            {(
              [
                ['depositsEnabled', 'Deposits enabled'],
                ['withdrawalsEnabled', 'Withdrawals enabled'],
                ['b2bMatchingEnabled', 'B2B matching enabled'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={txnFlagsTarget[key] !== false}
                  onChange={(e) =>
                    setTxnFlagsTarget({ ...txnFlagsTarget, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="mobile-upi-mode">
                Allow mobile number as UPI
              </label>
              <select
                id="mobile-upi-mode"
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
                value={
                  txnFlagsTarget.allowMobileNumberUpi === true
                    ? 'on'
                    : txnFlagsTarget.allowMobileNumberUpi === false
                      ? 'off'
                      : 'inherit'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setTxnFlagsTarget({
                    ...txnFlagsTarget,
                    allowMobileNumberUpi:
                      v === 'on' ? true : v === 'off' ? false : undefined,
                  });
                }}
              >
                <option value="inherit">Use platform default</option>
                <option value="on">Enabled for this business</option>
                <option value="off">Disabled for this business</option>
              </select>
              <p className="text-xs text-on-surface-variant">
                Controls 10-digit mobile UPI IDs (e.g. 9876543210@paytm) for this business&apos;s
                users.
              </p>
            </div>

            <div className="space-y-2 border-t border-outline-variant pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Deposit methods (users)
              </p>
              <div className="flex flex-wrap gap-3">
                {PAYMENT_METHODS.map((m) => {
                  const list =
                    txnFlagsTarget.allowedDepositMethods ??
                    txnFlagsTarget.allowedPaymentMethods ??
                    PAYMENT_METHODS.map((x) => x.value);
                  return (
                    <label key={`dep-${m.value}`} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={list.includes(m.value)}
                        onChange={(e) =>
                          setTxnFlagsTarget({
                            ...txnFlagsTarget,
                            allowedDepositMethods: toggleMethod(list, m.value, e.target.checked),
                          })
                        }
                      />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 border-t border-outline-variant pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Withdrawal methods (users)
              </p>
              <div className="flex flex-wrap gap-3">
                {PAYMENT_METHODS.map((m) => {
                  const list =
                    txnFlagsTarget.allowedWithdrawalMethods ??
                    txnFlagsTarget.allowedPaymentMethods ??
                    PAYMENT_METHODS.map((x) => x.value);
                  return (
                    <label key={`wd-${m.value}`} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={list.includes(m.value)}
                        onChange={(e) =>
                          setTxnFlagsTarget({
                            ...txnFlagsTarget,
                            allowedWithdrawalMethods: toggleMethod(
                              list,
                              m.value,
                              e.target.checked,
                            ),
                          })
                        }
                      />
                      {m.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {txnFlagsError ? (
              <p className="text-sm text-on-error-container">{txnFlagsError}</p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTxnFlagsError('');
                  setTxnFlagsTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                loading={saveTxnFlags.isPending}
                onClick={() => {
                  const dep =
                    txnFlagsTarget.allowedDepositMethods ??
                    txnFlagsTarget.allowedPaymentMethods ??
                    PAYMENT_METHODS.map((x) => x.value);
                  const wd =
                    txnFlagsTarget.allowedWithdrawalMethods ??
                    txnFlagsTarget.allowedPaymentMethods ??
                    PAYMENT_METHODS.map((x) => x.value);
                  if (!dep.length || !wd.length) {
                    setTxnFlagsError('Enable at least one deposit and one withdrawal method');
                    return;
                  }
                  setTxnFlagsError('');
                  saveTxnFlags.mutate({
                    depositsEnabled: txnFlagsTarget.depositsEnabled !== false,
                    withdrawalsEnabled: txnFlagsTarget.withdrawalsEnabled !== false,
                    b2bMatchingEnabled: txnFlagsTarget.b2bMatchingEnabled !== false,
                    // Keep existing partial-pay settings (controls removed from UI).
                    allowPartialPayMode:
                      txnFlagsTarget.allowPartialPay === true
                        ? 'on'
                        : txnFlagsTarget.allowPartialPay === false
                          ? 'off'
                          : 'inherit',
                    minPartialPayInr:
                      txnFlagsTarget.minPartialPayInr && txnFlagsTarget.minPartialPayInr > 0
                        ? txnFlagsTarget.minPartialPayInr
                        : 0,
                    allowMobileNumberUpiMode:
                      txnFlagsTarget.allowMobileNumberUpi === true
                        ? 'on'
                        : txnFlagsTarget.allowMobileNumberUpi === false
                          ? 'off'
                          : 'inherit',
                    allowedDepositMethods: dep,
                    allowedWithdrawalMethods: wd,
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
