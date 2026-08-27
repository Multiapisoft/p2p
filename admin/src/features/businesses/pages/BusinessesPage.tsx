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
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { fetchAllPages } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
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
  const [limitTarget, setLimitTarget] = useState<Business | null>(null);
  const [commissionTarget, setCommissionTarget] = useState<Business | null>(null);
  const [txnFlagsTarget, setTxnFlagsTarget] = useState<Business | null>(null);
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
  const [limitDraft, setLimitDraft] = useState('0');
  const [limitMode, setLimitMode] = useState<'set' | 'add' | 'deduct'>('set');
  const [limitError, setLimitError] = useState('');
  const [highlightDraft, setHighlightDraft] = useState('0');
  const [highlightError, setHighlightError] = useState('');
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

  const { data: limitStats, isLoading: loadingLimitStats } = useQuery({
    queryKey: ['business-stats', limitTarget?._id],
    queryFn: () => businessesApi.getStats(limitTarget!._id),
    enabled: !!limitTarget,
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
    setCommissionError('');
  }, [commissionTarget, businessCommission]);

  useEffect(() => {
    if (!limitTarget) return;
    setLimitDraft(limitMode === 'set' ? String(limitTarget.p2pPayLimit ?? 0) : '');
    setHighlightDraft(String(limitTarget.highlightLimitPerMonth ?? 0));
    setLimitError('');
    setHighlightError('');
  }, [limitTarget, limitMode]);

  const approve = useMutation({
    mutationFn: (id: string) => businessesApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['businesses'] }),
  });

  const saveLimit = useMutation({
    mutationFn: async () => {
      const num = Number(limitDraft);
      if (!Number.isFinite(num) || num < 0) {
        throw new Error('Enter a valid pay-limit amount');
      }
      if ((limitMode === 'add' || limitMode === 'deduct') && num <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      const hl = Number(highlightDraft);
      if (!Number.isFinite(hl) || hl < 0 || !Number.isInteger(hl)) {
        throw new Error('Highlight limit must be a whole number ≥ 0');
      }
      await businessesApi.setP2pPayLimit(limitTarget!._id, num, limitMode);
      return businessesApi.setHighlightLimit(limitTarget!._id, hl);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['businesses'] });
      qc.invalidateQueries({ queryKey: ['business-stats'] });
      qc.invalidateQueries({ queryKey: ['business-commission'] });
      setLimitTarget(null);
      setLimitMode('set');
    },
    onError: (err) => {
      const msg = getApiErrorMessage(err, 'Could not save limits');
      setLimitError(msg);
      setHighlightError(msg);
    },
  });

  const saveTxnFlags = useMutation({
    mutationFn: (body: {
      depositsEnabled: boolean;
      withdrawalsEnabled: boolean;
      b2bMatchingEnabled: boolean;
      allowPartialPay: boolean;
      allowMobileNumberUpi: boolean;
    }) => businessesApi.update(txnFlagsTarget!._id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['businesses'] });
      setTxnFlagsTarget(null);
    },
  });

  const saveCommissions = useMutation({
    mutationFn: () =>
      commissionsApi.upsertBusiness(commissionTarget!._id, {
        businessTakeDeposit,
        businessTakeWithdrawal,
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
                      <p className="text-xs text-on-surface-variant sm:text-sm">Pay limit</p>
                      <p className="font-semibold">
                        {formatCurrency(b.p2pPayLimit ?? 0)}
                      </p>
                      <p className="text-[11px] text-on-surface-variant">
                        Left {formatCurrency(b.p2pPayRemaining ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant sm:text-sm">Highlight / mo</p>
                      <p className="font-semibold">{b.highlightLimitPerMonth ?? 0}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        Left {b.highlightRemainingThisMonth ?? 0}
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
                      onClick={() => {
                        setLimitMode('set');
                        setLimitTarget(b);
                      }}
                    >
                      Set Limit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={() => setCommissionTarget(b)}
                    >
                      Commissions
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={() => setTxnFlagsTarget(b)}
                    >
                      Txn flags
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
        open={!!limitTarget}
        onClose={() => {
          setLimitTarget(null);
          setLimitMode('set');
        }}
        title={`Set limits — ${limitTarget?.name ?? ''}`}
      >
        {loadingLimitStats ? (
          <LoadingScreen />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setLimitError('');
              setHighlightError('');
              saveLimit.mutate();
            }}
          >
            <p className="text-sm text-on-surface-variant">
              Admin seed; deposits add, withdrawals deduct.
            </p>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-outline-variant bg-surface-container-low/50 p-3 text-sm">
              <div>
                <p className="text-xs text-on-surface-variant">From deposits</p>
                <p className="font-semibold">
                  {formatCurrency(limitStats?.p2pPayEarned ?? limitTarget?.p2pPayEarned ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant">Used</p>
                <p className="font-semibold">
                  {formatCurrency(limitStats?.p2pPayUsed ?? limitTarget?.p2pPayUsed ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant">Current seed</p>
                <p className="font-semibold">
                  {formatCurrency(limitStats?.p2pPayLimit ?? limitTarget?.p2pPayLimit ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant">Remaining</p>
                <p className="text-lg font-bold text-secondary">
                  {formatCurrency(
                    (limitStats?.p2pPayRemaining ?? limitTarget?.p2pPayRemaining) ?? 0,
                  )}
                </p>
              </div>
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
                    onClick={() => setLimitMode(opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      limitMode === opt.value
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
                limitMode === 'set'
                  ? 'Seed pay limit (₹)'
                  : limitMode === 'add'
                    ? 'Amount to add (₹)'
                    : 'Amount to deduct (₹)'
              }
              type="number"
              min={0}
              step="1"
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              required
            />
            {limitMode !== 'set' && limitDraft !== '' && Number.isFinite(Number(limitDraft)) ? (
              <p className="text-xs text-on-surface-variant">
                Seed after:{' '}
                {formatCurrency(
                  Math.max(
                    0,
                    (limitStats?.p2pPayLimit ?? limitTarget?.p2pPayLimit ?? 0) +
                      (limitMode === 'add' ? Number(limitDraft) : -Number(limitDraft)),
                  ),
                )}
              </p>
            ) : null}

            <div className="rounded-xl border border-outline-variant p-3 space-y-3">
              <div>
                <p className="text-sm font-semibold">Monthly highlight limit</p>
                <p className="text-xs text-on-surface-variant">
                  Monthly pin quota for pay lists. 0 = off.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-on-surface-variant">Used this month</p>
                  <p className="font-semibold">
                    {limitStats?.highlightUsedThisMonth ??
                      limitTarget?.highlightUsedThisMonth ??
                      0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Remaining</p>
                  <p className="font-semibold text-secondary">
                    {limitStats?.highlightRemainingThisMonth ??
                      limitTarget?.highlightRemainingThisMonth ??
                      0}
                  </p>
                </div>
              </div>
              <Input
                label="Highlights per month"
                type="number"
                min={0}
                step={1}
                value={highlightDraft}
                onChange={(e) => setHighlightDraft(e.target.value)}
                required
              />
            </div>

            {limitError || highlightError ? (
              <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {limitError || highlightError}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLimitTarget(null);
                  setLimitMode('set');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saveLimit.isPending}>
                Save limits
              </Button>
            </div>
          </form>
        )}
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
              <label className="text-sm font-semibold" htmlFor="p2p-pay-limit">
                Platform Payment pay limit (₹)
              </label>
              <p className="text-xs text-on-surface-variant">
                Earned: {formatCurrency(businessCommission?.p2pPayEarned ?? 0)} · Used:{' '}
                {formatCurrency(businessCommission?.p2pPayUsed ?? 0)}
                {` · Remaining: ${formatCurrency(businessCommission?.p2pPayRemaining ?? 0)}`}
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
        onClose={() => setTxnFlagsTarget(null)}
        title={`Txn flags — ${txnFlagsTarget?.name ?? ''}`}
      >
        {txnFlagsTarget ? (
          <div className="space-y-4">
            {(
              [
                ['depositsEnabled', 'Deposits enabled'],
                ['withdrawalsEnabled', 'Withdrawals enabled'],
                ['b2bMatchingEnabled', 'B2B matching enabled'],
                ['allowPartialPay', 'Allow partial payments'],
                ['allowMobileNumberUpi', 'Allow mobile number as UPI'],
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
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTxnFlagsTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                loading={saveTxnFlags.isPending}
                onClick={() =>
                  saveTxnFlags.mutate({
                    depositsEnabled: txnFlagsTarget.depositsEnabled !== false,
                    withdrawalsEnabled: txnFlagsTarget.withdrawalsEnabled !== false,
                    b2bMatchingEnabled: txnFlagsTarget.b2bMatchingEnabled !== false,
                    allowPartialPay: txnFlagsTarget.allowPartialPay !== false,
                    allowMobileNumberUpi: txnFlagsTarget.allowMobileNumberUpi !== false,
                  })
                }
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
