'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { investorsApi } from '../api/investors.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import type { Investment, Redemption } from '@/shared/types/api.types';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [5, 10, 20];

function investorLabel(investorId: Redemption['investorId'] | Investment['investorId']) {
  if (!investorId) return '—';
  if (typeof investorId === 'string') return investorId;
  const parts = [investorId.name, investorId.email, investorId.phone].filter(Boolean);
  return parts.length ? parts.join(' · ') : investorId._id;
}

export function InvestorsPage() {
  const [tab, setTab] = useState<'redemptions' | 'investments'>('redemptions');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, sort, search }),
    [page, limit, sort, search],
  );

  const {
    data: redemptions,
    isLoading: loadingR,
    isFetching: fetchingR,
    isError: errorR,
    error: errR,
  } = useQuery({
    queryKey: ['investor-redemptions', listQuery],
    queryFn: () => investorsApi.getPendingRedemptions(listQuery),
    enabled: tab === 'redemptions',
  });

  const {
    data: investments,
    isLoading: loadingI,
    isFetching: fetchingI,
    isError: errorI,
    error: errI,
  } = useQuery({
    queryKey: ['investor-investments', listQuery],
    queryFn: () => investorsApi.getPendingInvestments(listQuery),
    enabled: tab === 'investments',
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['investor-redemptions'] });
    void qc.invalidateQueries({ queryKey: ['investor-investments'] });
  };

  const approveR = useMutation({
    mutationFn: (id: string) => {
      setActionId(id);
      return investorsApi.approveRedemption(id);
    },
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Redemption approved — amount deducted from investor wallet.' });
      refresh();
    },
    onError: (err) => {
      setBanner({ type: 'err', text: getApiErrorMessage(err, 'Failed to approve redemption') });
    },
    onSettled: () => setActionId(null),
  });

  const approveI = useMutation({
    mutationFn: (id: string) => {
      setActionId(id);
      return investorsApi.approveInvestment(id);
    },
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Investment approved — amount credited to investor wallet.' });
      refresh();
    },
    onError: (err) => {
      setBanner({ type: 'err', text: getApiErrorMessage(err, 'Failed to approve investment') });
    },
    onSettled: () => setActionId(null),
  });

  const rejectR = useMutation({
    mutationFn: (reason: string) => investorsApi.rejectRedemption(rejectId!, reason),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Redemption rejected — locked amount released.' });
      setRejectId(null);
      setRejectReason('');
      refresh();
    },
    onError: (err) => {
      setBanner({ type: 'err', text: getApiErrorMessage(err, 'Failed to reject redemption') });
    },
  });

  const rejectI = useMutation({
    mutationFn: (reason: string) => investorsApi.rejectInvestment(rejectId!, reason),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Investment rejected.' });
      setRejectId(null);
      setRejectReason('');
      refresh();
    },
    onError: (err) => {
      setBanner({ type: 'err', text: getApiErrorMessage(err, 'Failed to reject investment') });
    },
  });

  const isLoading = tab === 'redemptions' ? loadingR : loadingI;
  const isFetching = tab === 'redemptions' ? fetchingR : fetchingI;
  const listError = tab === 'redemptions' ? errorR : errorI;
  const listErrObj = tab === 'redemptions' ? errR : errI;
  const data = tab === 'redemptions' ? redemptions : investments;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rejecting = rejectR.isPending || rejectI.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
          Investors
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Pending redemptions (payout) aur investments (credit) approve / reject karo.
        </p>
      </div>

      {banner && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            banner.type === 'ok'
              ? 'bg-secondary-container text-on-secondary-container'
              : 'bg-error-container text-on-error-container'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total pending
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
            Queue
          </p>
          <p className="mt-1 text-lg font-bold capitalize sm:text-2xl">{tab}</p>
        </div>
      </div>

      <div className="chip-scroll">
        {(['redemptions', 'investments'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPage(1);
              setBanner(null);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize sm:px-4 sm:py-2 sm:text-sm ${
              tab === t ? 'bg-primary text-on-primary' : 'border border-outline-variant'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Input
            className="min-w-0 flex-1 sm:min-w-[220px]"
            placeholder="Search reference, email, phone…"
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

        {isLoading ? (
          <LoadingScreen />
        ) : listError ? (
          <EmptyState
            message={getApiErrorMessage(listErrObj, `Failed to load pending ${tab}`)}
            icon="error"
          />
        ) : !items.length ? (
          <EmptyState message={`No pending ${tab}`} icon="savings" />
        ) : (
          <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((item) => {
              const rdm =
                tab === 'redemptions'
                  ? (item as Redemption)
                  : null;
              const inv = tab === 'investments' ? (item as Investment) : null;
              const busy = actionId === item._id;

              return (
                <div
                  key={item._id}
                  className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.referenceId}</p>
                    <p className="text-xs text-on-surface-variant sm:text-sm">
                      {formatDate(item.createdAt)}
                    </p>
                    <p className="mt-1 truncate text-xs text-on-surface-variant">
                      {investorLabel(item.investorId)}
                    </p>
                    {rdm?.method ? (
                      <p className="mt-1 text-xs font-semibold uppercase text-secondary">
                        {rdm.method}
                      </p>
                    ) : null}
                    {inv?.method ? (
                      <p className="mt-1 text-xs font-semibold uppercase text-secondary">
                        {inv.method}
                      </p>
                    ) : null}
                    {rdm?.method === 'upi' && rdm.upiDetails?.upiId ? (
                      <p className="text-xs">UPI: {rdm.upiDetails.upiId}</p>
                    ) : null}
                    {rdm?.method === 'bank' && rdm.bankDetails?.accountNumber ? (
                      <p className="text-xs">
                        Bank ****{rdm.bankDetails.accountNumber.slice(-4)} ·{' '}
                        {rdm.bankDetails.ifscCode}
                        {rdm.bankDetails.accountHolderName
                          ? ` · ${rdm.bankDetails.accountHolderName}`
                          : ''}
                      </p>
                    ) : null}
                    {rdm?.method === 'usdt' && rdm.usdtDetails?.walletAddress ? (
                      <p className="break-all text-xs">
                        {rdm.usdtDetails.network || 'TRC20'}: {rdm.usdtDetails.walletAddress}
                      </p>
                    ) : null}
                    {(rdm?.note || inv?.note) && (
                      <p className="text-xs text-on-surface-variant">{rdm?.note || inv?.note}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <p className="font-bold text-secondary">{formatCurrency(item.amount)}</p>
                    <StatusBadge status={item.status} />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy && (approveR.isPending || approveI.isPending)}
                      disabled={!!actionId && !busy}
                      onClick={() => {
                        setBanner(null);
                        if (tab === 'redemptions') approveR.mutate(item._id);
                        else approveI.mutate(item._id);
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!!actionId}
                      onClick={() => {
                        setBanner(null);
                        setRejectId(item._id);
                        setRejectReason('');
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <Modal
        open={!!rejectId}
        onClose={() => {
          if (!rejecting) setRejectId(null);
        }}
        title="Reject Request"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (tab === 'redemptions') rejectR.mutate(rejectReason);
            else rejectI.mutate(rejectReason);
          }}
        >
          <Input
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
            disabled={rejecting}
          />
          {(rejectR.isError || rejectI.isError) && (
            <p className="text-sm text-on-error-container">
              {getApiErrorMessage(
                rejectR.error || rejectI.error,
                'Reject failed',
              )}
            </p>
          )}
          <Button type="submit" variant="danger" className="w-full" loading={rejecting}>
            Confirm Reject
          </Button>
        </form>
      </Modal>
    </div>
  );
}
