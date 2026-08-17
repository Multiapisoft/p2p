'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { p2pPayApi } from '@/features/deposits/api/p2p-pay.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { StatCard, Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate } from '@/shared/lib/utils';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance(),
  });

  const { data: wallets, isLoading: walletsLoading } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => walletApi.getWallets(),
  });

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['user-dashboard-summary'],
    queryFn: () => p2pPayApi.getDashboard(),
    refetchInterval: 30_000,
  });

  if (balanceLoading || walletsLoading || summaryLoading) return <LoadingScreen />;

  const inrWallet = wallets?.find((w) => w.currency === 'INR');
  const isPartner = balance?.source === 'partner';
  const displayCurrency = balance?.currency || 'INR';
  const pendingLocked = inrWallet?.lockedBalance ?? balance?.lockedBalance ?? 0;
  const dep = summary?.deposits;
  const wd = summary?.withdrawals;
  const needsAttention =
    (dep?.pendingVerification ?? 0) +
    (wd?.awaitingConfirmCount ?? 0) +
    (wd?.open ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold text-on-background sm:text-2xl md:text-3xl">
            Hello{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p className="text-sm text-on-surface-variant">
            Wallet, deposits, and withdrawals at a glance
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refetchSummary()}>
          Refresh
        </Button>
      </div>

      {summaryError && (
        <p className="rounded-xl border border-error/30 bg-error-container/40 px-3 py-2 text-sm text-on-error-container">
          Could not load activity summary. Balance below may still be up to date.
        </p>
      )}

      <section className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Available Balance"
          value={formatCurrency(balance?.availableBalance ?? 0, displayCurrency)}
          icon="account_balance_wallet"
          variant="success"
        />
        <StatCard
          label="Locked"
          value={formatCurrency(pendingLocked, 'INR')}
          icon="lock"
          trend={pendingLocked > 0 ? 'In open withdrawals' : 'Nothing locked'}
        />
        <StatCard
          label="Total deposited"
          value={formatCurrency(dep?.completedAmount ?? inrWallet?.totalDeposited ?? 0)}
          icon="south_west"
          trend={`${dep?.completed ?? 0} completed deposits`}
          variant="success"
        />
        <StatCard
          label="Total withdrawn"
          value={formatCurrency(wd?.completedAmount ?? inrWallet?.totalWithdrawn ?? 0)}
          icon="north_east"
          trend={`${wd?.completed ?? 0} completed withdrawals`}
        />
      </section>

      {isPartner && typeof balance?.approxInrAvailable === 'number' && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant sm:text-sm">
          Approx INR withdrawable from partner wallet:{' '}
          <strong>{formatCurrency(balance.approxInrAvailable, 'INR')}</strong>
        </p>
      )}

      <section className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card
          title="Needs attention"
          action={
            <span className="text-sm font-bold text-amber-700">{needsAttention}</span>
          }
        >
          <div className="space-y-2">
            <AttentionLink
              href="/my-deposits?status=pending"
              icon="hourglass_top"
              label="Deposits pending verification"
              count={dep?.pendingVerification ?? 0}
              amount={dep?.pendingAmount}
            />
            <AttentionLink
              href="/withdrawals"
              icon="fact_check"
              label="Payments to confirm received"
              count={wd?.awaitingConfirmCount ?? 0}
              amount={wd?.awaitingConfirmAmount}
            />
            <AttentionLink
              href="/withdrawals?status=pending"
              icon="pending_actions"
              label="Open withdrawals"
              count={wd?.open ?? 0}
              amount={wd?.remainingAmount}
            />
          </div>
        </Card>

        <Card
          title="Deposits"
          action={
            <Link href="/my-deposits" className="text-sm font-semibold text-secondary hover:underline">
              View all
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Total" value={String(dep?.total ?? 0)} />
            <MiniStat label="Completed" value={String(dep?.completed ?? 0)} tone="ok" />
            <MiniStat
              label="Pending verify"
              value={String(dep?.pendingVerification ?? 0)}
              tone="warn"
            />
            <MiniStat label="Rejected" value={String(dep?.rejected ?? 0)} tone="bad" />
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            Credited to wallet:{' '}
            <span className="font-semibold text-on-surface">
              {formatCurrency(dep?.creditedAmount ?? 0)}
            </span>
          </p>
          <Link href="/deposits" className="mt-3 inline-block">
            <Button size="sm" variant="secondary">
              Make a deposit
            </Button>
          </Link>
        </Card>

        <Card
          title="Withdrawals"
          action={
            <Link
              href="/withdrawals"
              className="text-sm font-semibold text-secondary hover:underline"
            >
              View all
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Total" value={String(wd?.total ?? 0)} />
            <MiniStat label="Completed" value={String(wd?.completed ?? 0)} tone="ok" />
            <MiniStat label="Open" value={String(wd?.open ?? 0)} tone="warn" />
            <MiniStat
              label="Remaining amt"
              value={formatCurrency(wd?.remainingAmount ?? 0)}
              tone="warn"
            />
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            Awaiting your confirm:{' '}
            <span className="font-semibold text-amber-700">
              {wd?.awaitingConfirmCount ?? 0} ·{' '}
              {formatCurrency(wd?.awaitingConfirmAmount ?? 0)}
            </span>
          </p>
          <Link href="/withdrawals" className="mt-3 inline-block">
            <Button size="sm" variant="secondary">
              Manage withdrawals
            </Button>
          </Link>
        </Card>
      </section>

      <section className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card
          title="Recent deposits"
          action={
            <Link href="/my-deposits" className="text-sm font-semibold text-secondary hover:underline">
              All
            </Link>
          }
        >
          {!summary?.recentDeposits?.length ? (
            <p className="text-sm text-on-surface-variant">No deposits yet</p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {summary.recentDeposits.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {formatCurrency(d.amount, d.currency)}
                    </p>
                    <p className="truncate text-xs text-on-surface-variant">
                      {d.referenceId} · {formatDate(d.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent withdrawals"
          action={
            <Link
              href="/withdrawals"
              className="text-sm font-semibold text-secondary hover:underline"
            >
              All
            </Link>
          }
        >
          {!summary?.recentWithdrawals?.length ? (
            <p className="text-sm text-on-surface-variant">No withdrawals yet</p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {summary.recentWithdrawals.map((w) => {
                const remaining = Math.max(0, w.amount - (w.paidAmount || 0));
                return (
                  <li key={w._id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {formatCurrency(w.amount, w.currency)}
                        {remaining > 0 && w.status !== 'completed' && (
                          <span className="ml-1 text-xs font-normal text-amber-700">
                            · left {formatCurrency(remaining, w.currency)}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-on-surface-variant">
                        {w.referenceId} · {formatDate(w.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={w.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <Card title="Quick actions">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {[
            { href: '/deposits', icon: 'south_west', label: 'Deposit' },
            { href: '/my-deposits', icon: 'history', label: 'My Deposits' },
            { href: '/withdrawals', icon: 'north_east', label: 'Withdraw' },
            { href: '/transactions', icon: 'receipt_long', label: 'Ledger' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant p-3 transition-colors hover:bg-surface-container-low active:scale-95 sm:gap-2 sm:p-4"
            >
              <span className="material-symbols-outlined text-xl text-secondary sm:text-2xl">
                {item.icon}
              </span>
              <span className="text-xs font-semibold sm:text-sm">{item.label}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'ok' | 'warn' | 'bad';
}) {
  const toneClass = {
    default: 'text-on-surface',
    ok: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-error',
  } as const;
  return (
    <div className="rounded-lg bg-surface-container-low px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase text-on-surface-variant">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${toneClass[tone]}`}>{value}</p>
    </div>
  );
}

function AttentionLink({
  href,
  icon,
  label,
  count,
  amount,
}: {
  href: string;
  icon: string;
  label: string;
  count: number;
  amount?: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant px-3 py-2.5 transition hover:bg-surface-container-low"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="material-symbols-outlined text-secondary">{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          {amount != null && amount > 0 && (
            <p className="text-[11px] text-on-surface-variant">{formatCurrency(amount)}</p>
          )}
        </div>
      </div>
      <span className={`text-lg font-bold ${count ? 'text-amber-700' : ''}`}>{count}</span>
    </Link>
  );
}
