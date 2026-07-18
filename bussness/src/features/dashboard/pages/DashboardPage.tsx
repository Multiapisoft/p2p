'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { businessApi } from '@/features/business/api/business.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { depositsApi } from '@/features/deposits/api/deposits.api';
import { withdrawalsApi } from '@/features/withdrawals/api/withdrawals.api';
import { usersApi } from '@/features/users/api/users.api';
import { StatCard } from '@/shared/components/ui/Card';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage, isNotFoundError } from '@/shared/api/client';
import { resolveUser } from '@/shared/lib/entity-user';

const QUICK_LINKS = [
  { href: '/users', icon: 'group', title: 'Users', desc: 'Integrated users' },
  { href: '/deposits', icon: 'south_west', title: 'Deposits', desc: 'Incoming funds' },
  { href: '/withdrawals', icon: 'north_east', title: 'Withdrawals', desc: 'Payout requests' },
  { href: '/transactions', icon: 'receipt_long', title: 'Ledger', desc: 'Float activity' },
  { href: '/integration', icon: 'api', title: 'Integration', desc: 'API & partner' },
  { href: '/support', icon: 'support_agent', title: 'Support', desc: 'Help tickets' },
] as const;

export function DashboardPage() {
  const {
    data: business,
    isLoading: loadingBusiness,
    error: businessError,
    refetch: refetchBusiness,
  } = useQuery({
    queryKey: ['business-me'],
    queryFn: () => businessApi.getMe(),
    retry: (count, err) => !isNotFoundError(err) && count < 1,
  });

  const noBusiness = isNotFoundError(businessError);
  const businessLoadFailed = !!businessError && !noBusiness;

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['business-overview'],
    queryFn: () => businessApi.getOverview(),
    enabled: !!business,
  });

  const { data: stats } = useQuery({
    queryKey: ['business-stats'],
    queryFn: () => businessApi.getStats(),
    enabled: !!business,
  });

  const { data: walletBalance } = useQuery({
    queryKey: ['business-wallet'],
    queryFn: () => walletApi.getBalance(),
    enabled: !!business,
  });

  const { data: recentDeposits } = useQuery({
    queryKey: ['business-deposits-recent'],
    queryFn: () => depositsApi.getBusinessDeposits({ page: 1, limit: 6, sort: 'newest' }),
    enabled: !!business,
  });

  const { data: recentWithdrawals } = useQuery({
    queryKey: ['business-withdrawals-recent'],
    queryFn: () => withdrawalsApi.getBusinessWithdrawals({ page: 1, limit: 6, sort: 'newest' }),
    enabled: !!business,
  });

  const { data: recentUsers } = useQuery({
    queryKey: ['business-users-recent'],
    queryFn: () => usersApi.getBusinessUsers({ page: 1, limit: 5, sort: 'newest' }),
    enabled: !!business,
  });

  if (loadingBusiness) return <LoadingScreen />;

  if (businessLoadFailed) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <span className="material-symbols-outlined text-5xl text-error">cloud_off</span>
        <h1 className="text-xl font-bold">Could not load dashboard</h1>
        <p className="text-sm text-on-surface-variant">
          {getApiErrorMessage(businessError, 'Unable to load your business profile')}
        </p>
        <Button onClick={() => refetchBusiness()}>Retry</Button>
      </div>
    );
  }

  if (noBusiness || !business) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Business Dashboard"
          description="Complete integration setup to unlock live stats and activity"
        />

        <Card className="border-secondary/30 bg-gradient-to-br from-secondary-container/20 to-surface-container-lowest">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-secondary">
                Setup required
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-headline)] text-2xl font-bold">
                Your business profile is not set up yet
              </h2>
              <p className="mt-2 max-w-xl text-sm text-on-surface-variant">
                Add partner balance, credit, and debit URLs, then generate API keys. After that,
                users, deposits, and withdrawals will appear here in real time.
              </p>
            </div>
            <Link href="/integration">
              <Button size="lg">Go to Integration Setup</Button>
            </Link>
          </div>
        </Card>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total Users" value={0} icon="group" trend="After setup" />
          <StatCard label="Deposits" value={0} icon="south_west" trend="Pending setup" />
          <StatCard label="Withdrawals" value={0} icon="north_east" trend="Pending setup" />
          <StatCard label="Deposit volume" value={formatCurrency(0)} icon="payments" />
          <StatCard label="Commission" value={formatCurrency(0)} icon="savings" />
          <StatCard label="Float wallet" value={formatCurrency(0)} icon="account_balance_wallet" />
        </section>

        <Card title="Setup checklist">
          <ol className="space-y-3 text-sm">
            {[
              'Open Integration and enter your business name plus partner API URLs',
              'Save your API Key and Secret (shown only once)',
              'Add the P2P keys to your partner application .env',
              'Start registering users and processing deposits via redirect',
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary-container text-xs font-bold text-on-secondary-container">
                  {i + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </Card>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {QUICK_LINKS.map((item) => (
            <Link key={item.href} href="/integration">
              <Card className="h-full transition hover:border-secondary/40">
                <div className="flex flex-col items-center gap-2 p-1 text-center">
                  <span className="material-symbols-outlined text-2xl text-secondary">{item.icon}</span>
                  <p className="text-sm font-semibold">{item.title}</p>
                </div>
              </Card>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  const pendingDeposits = overview?.pendingDeposits ?? 0;
  const pendingWithdrawals = overview?.pendingWithdrawals ?? 0;
  const needsAttention = pendingDeposits + pendingWithdrawals;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={business.name}
        description="Live overview of users, money flow, and your float wallet"
        action={<StatusBadge status={business.status} />}
      />

      {business.status === 'pending' && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your business status is <strong>pending</strong>. An admin must approve it for full
          production use. You can still test integration in the meantime.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="bg-gradient-to-br from-secondary-container/25 via-surface-container-lowest to-primary-container/10 p-1">
            <div className="rounded-xl bg-surface-container-lowest/80 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                    Partner float wallet
                  </p>
                  <p className="mt-2 font-[family-name:var(--font-headline)] text-4xl font-bold text-secondary md:text-5xl">
                    {formatCurrency(walletBalance?.availableBalance ?? 0)}
                  </p>
                  <p className="mt-1 text-sm text-on-surface-variant">Available balance</p>
                </div>
                <Link href="/transactions">
                  <Button variant="secondary" size="sm">
                    View ledger
                  </Button>
                </Link>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-surface-container-low px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase text-on-surface-variant">Locked</p>
                  <p className="mt-0.5 font-bold">
                    {formatCurrency(walletBalance?.lockedBalance ?? 0)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-container-low px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase text-on-surface-variant">
                    Deposit vol.
                  </p>
                  <p className="mt-0.5 font-bold">
                    {formatCurrency(overview?.totalDepositAmount ?? 0)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-container-low px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase text-on-surface-variant">
                    Withdraw vol.
                  </p>
                  <p className="mt-0.5 font-bold">
                    {formatCurrency(overview?.totalWithdrawals ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Needs attention">
          <div className="space-y-3">
            <Link
              href="/deposits?status=pending"
              className="flex items-center justify-between rounded-xl border border-outline-variant px-3 py-3 transition hover:bg-surface-container-low"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">south_west</span>
                <span className="text-sm font-medium">Pending deposits</span>
              </div>
              <span className={`text-lg font-bold ${pendingDeposits ? 'text-amber-700' : ''}`}>
                {pendingDeposits}
              </span>
            </Link>
            <Link
              href="/withdrawals?status=pending"
              className="flex items-center justify-between rounded-xl border border-outline-variant px-3 py-3 transition hover:bg-surface-container-low"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">north_east</span>
                <span className="text-sm font-medium">Open withdrawals</span>
              </div>
              <span className={`text-lg font-bold ${pendingWithdrawals ? 'text-amber-700' : ''}`}>
                {pendingWithdrawals}
              </span>
            </Link>
            <div className="rounded-xl bg-surface-container-low px-3 py-3 text-sm text-on-surface-variant">
              {needsAttention
                ? `${needsAttention} open item${needsAttention === 1 ? '' : 's'} — review deposits and withdrawals.`
                : 'All clear — no pending deposits or withdrawals.'}
            </div>
            <Link href="/integration?tab=tools">
              <Button className="w-full" variant="secondary">
                Open User Tools
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <section>
        <h2 className="mb-4 font-[family-name:var(--font-headline)] text-lg font-bold">
          Live statistics
        </h2>
        {loadingOverview ? (
          <LoadingScreen />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Total Users"
              value={overview?.totalUsers ?? 0}
              icon="group"
              trend="Via your API / referral"
              variant="success"
            />
            <StatCard
              label="Deposits"
              value={overview?.depositCount ?? 0}
              icon="south_west"
              trend={`${overview?.completedDeposits ?? 0} completed · ${pendingDeposits} open`}
              variant={pendingDeposits ? 'warning' : 'default'}
            />
            <StatCard
              label="Deposit volume"
              value={formatCurrency(overview?.totalDepositAmount ?? 0)}
              icon="payments"
              variant="success"
            />
            <StatCard
              label="Withdrawals"
              value={overview?.withdrawalCount ?? 0}
              icon="north_east"
              trend={`${overview?.completedWithdrawals ?? 0} completed · ${pendingWithdrawals} open`}
              variant={pendingWithdrawals ? 'warning' : 'default'}
            />
            <StatCard
              label="Withdrawal volume"
              value={formatCurrency(overview?.totalWithdrawals ?? 0)}
              icon="payments"
            />
            <StatCard
              label="Commission earned"
              value={formatCurrency(overview?.totalCommissionEarned ?? 0)}
              icon="savings"
              trend={`Rate ${overview?.commissionRate ?? business.commissionRate}%`}
            />
            <StatCard
              label="P2P pay limit"
              value={
                (stats?.p2pPayLimit ?? 0) > 0
                  ? formatCurrency(stats?.p2pPayLimit ?? 0)
                  : 'Unlimited'
              }
              icon="tune"
              trend={
                stats?.p2pPayRemaining == null
                  ? `Used ${formatCurrency(stats?.p2pPayUsed ?? 0)}`
                  : `Remaining ${formatCurrency(stats.p2pPayRemaining)} · used ${formatCurrency(stats.p2pPayUsed ?? 0)}`
              }
              variant={
                stats?.p2pPayRemaining != null && stats.p2pPayRemaining <= 0
                  ? 'warning'
                  : 'default'
              }
            />
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Recent users"
          action={
            <Link href="/users" className="text-sm font-semibold text-secondary hover:underline">
              View all
            </Link>
          }
        >
          {!recentUsers?.items.length ? (
            <p className="text-sm text-on-surface-variant">No users linked yet</p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {recentUsers.items.map((u) => (
                <li key={u._id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{u.name}</p>
                    <p className="truncate text-xs text-on-surface-variant">{u.email}</p>
                  </div>
                  <StatusBadge status={u.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent deposits"
          action={
            <Link href="/deposits" className="text-sm font-semibold text-secondary hover:underline">
              View all
            </Link>
          }
        >
          {!recentDeposits?.items.length ? (
            <p className="text-sm text-on-surface-variant">No deposits yet</p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {recentDeposits.items.map((d) => {
                const user = resolveUser(d.userId);
                return (
                  <li key={d._id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {formatCurrency(d.amount, d.currency)}
                      </p>
                      <p className="truncate text-xs text-on-surface-variant">
                        {user.name} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={d.status} />
                  </li>
                );
              })}
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
              View all
            </Link>
          }
        >
          {!recentWithdrawals?.items.length ? (
            <p className="text-sm text-on-surface-variant">No withdrawals yet</p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {recentWithdrawals.items.map((w) => {
                const user = resolveUser(w.userId);
                return (
                  <li key={w._id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {formatCurrency(w.amount, w.currency)}
                      </p>
                      <p className="truncate text-xs text-on-surface-variant">
                        {user.name} · {formatDate(w.createdAt)}
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

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {QUICK_LINKS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition hover:border-secondary/40 hover:shadow-md">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <span className="material-symbols-outlined text-2xl text-secondary">{item.icon}</span>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-[11px] text-on-surface-variant">{item.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <Card title="API credentials">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-on-surface-variant">API Key</p>
            <p className="mt-1 truncate font-mono text-sm">{business.apiKey}</p>
          </div>
          <Link href="/integration">
            <Button variant="secondary">Manage integration</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
