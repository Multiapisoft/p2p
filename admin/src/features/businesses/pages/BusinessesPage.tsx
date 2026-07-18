'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency } from '@/shared/lib/utils';
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

export function BusinessesPage() {
  const [statsTarget, setStatsTarget] = useState<Business | null>(null);
  const [commissionTarget, setCommissionTarget] = useState<Business | null>(null);
  const [businessTake, setBusinessTake] = useState<CommissionRuleInput[]>([emptyRule({ percentage: 2 })]);
  const [investorBonus, setInvestorBonus] = useState<CommissionRuleInput[]>([
    emptyRule({ percentage: 1, feeMode: 'percentage' }),
  ]);
  const [p2pPayLimit, setP2pPayLimit] = useState('0');
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
    setBusinessTake(rulesFromConfigs(businessCommission.businessTake));
    setInvestorBonus(rulesFromConfigs(businessCommission.investorBonus));
    setP2pPayLimit(String(businessCommission.p2pPayLimit ?? 0));
    setCommissionError('');
  }, [commissionTarget, businessCommission]);

  const approve = useMutation({
    mutationFn: (id: string) => businessesApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['businesses'] }),
  });

  const saveCommissions = useMutation({
    mutationFn: () =>
      commissionsApi.upsertBusiness(commissionTarget!._id, {
        businessTake,
        investorBonus,
        p2pPayLimit: Number(p2pPayLimit) || 0,
      }),
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
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Businesses</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">Manage business partners & API integrations</p>
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
          <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {items.map((b) => (
                <div key={b._id} className="rounded-xl border border-outline-variant p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold sm:text-lg">{b.name}</h3>
                      <p className="truncate text-sm text-on-surface-variant">/{b.slug}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:mt-4 sm:gap-3">
                    <div>
                      <p className="text-xs text-on-surface-variant sm:text-sm">Total Deposits</p>
                      <p className="font-semibold">{formatCurrency(b.totalDeposits)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant sm:text-sm">Users</p>
                      <p className="font-semibold">{b.totalUsers}</p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant sm:text-sm">Commission rate</p>
                      <p className="font-semibold">{b.commissionRate ?? 0}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant sm:text-sm">P2P pay limit</p>
                      <p className="font-semibold">
                        {(b.p2pPayLimit ?? 0) > 0
                          ? formatCurrency(b.p2pPayLimit!)
                          : 'Unlimited'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={() => setStatsTarget(b)}
                    >
                      View Stats
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 sm:flex-none"
                      onClick={() => setCommissionTarget(b)}
                    >
                      Set Limit & Commission
                    </Button>
                    {b.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1 sm:flex-none"
                        loading={approve.isPending}
                        onClick={() => approve.mutate(b._id)}
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>

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
              <p className="text-on-surface-variant">P2P Pay Limit</p>
              <p className="font-semibold">
                {(stats.p2pPayLimit ?? 0) > 0
                  ? formatCurrency(stats.p2pPayLimit ?? 0)
                  : 'Unlimited'}
              </p>
            </div>
            <div>
              <p className="text-on-surface-variant">P2P Pay Used</p>
              <p className="font-semibold">{formatCurrency(stats.p2pPayUsed ?? 0)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-on-surface-variant">P2P Pay Remaining</p>
              <p className="text-lg font-bold">
                {stats.p2pPayRemaining == null
                  ? 'Unlimited'
                  : formatCurrency(stats.p2pPayRemaining)}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!commissionTarget}
        onClose={() => setCommissionTarget(null)}
        title={`Limit & Commission — ${commissionTarget?.name ?? ''}`}
        className="sm:max-w-2xl"
      >
        {loadingCommission ? (
          <LoadingScreen />
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-on-surface-variant">
              Business fee sirf business limit / stats ke liye hai — investor se cut nahi hota.
              Investor ko pay amount + bonus milta hai. Limit khatam hone par withdrawals open
              nahi dikhenge.
            </p>

            <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low/40 p-3">
              <label className="text-sm font-semibold" htmlFor="p2p-pay-limit">
                P2P pay limit (₹)
              </label>
              <p className="text-xs text-on-surface-variant">
                Investors is business ke withdrawals pe max itna pay kar sakte hain. 0 = unlimited.
                Used: {formatCurrency(businessCommission?.p2pPayUsed ?? 0)}
                {businessCommission?.p2pPayRemaining != null
                  ? ` · Remaining: ${formatCurrency(businessCommission.p2pPayRemaining)}`
                  : ' · Remaining: Unlimited'}
              </p>
              <Input
                id="p2p-pay-limit"
                type="number"
                min={0}
                value={p2pPayLimit}
                onChange={(e) => setP2pPayLimit(e.target.value)}
              />
            </div>

            <CommissionRulesEditor
              title="Business take (tracking / stats)"
              hint="Ye fee investor se nahi katati — business P2P limit / commission tracking ke liye hai."
              rules={businessTake}
              onChange={setBusinessTake}
            />

            <CommissionRulesEditor
              title="Investor bonus (extra credit)"
              hint="Investor ko wallet mein pay amount + ye bonus milta hai."
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
    </div>
  );
}
