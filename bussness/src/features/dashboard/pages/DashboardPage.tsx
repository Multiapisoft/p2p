'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { businessApi } from '@/features/business/api/business.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { depositsApi } from '@/features/deposits/api/deposits.api';
import { withdrawalsApi } from '@/features/withdrawals/api/withdrawals.api';
import { usersApi } from '@/features/users/api/users.api';
import { StatCard, Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { CopyField, LoadingScreen } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage, isNotFoundError } from '@/shared/api/client';
import { resolveUser } from '@/shared/lib/entity-user';

const USER_APP_URL = (process.env.NEXT_PUBLIC_USER_APP_URL || 'http://localhost:5174').replace(
  /\/$/,
  '',
);

const QUICK_LINKS = [
  { href: '/users', icon: 'group', title: 'Users', desc: 'Linked accounts' },
  { href: '/deposits', icon: 'south_west', title: 'Deposits', desc: 'Incoming' },
  { href: '/withdrawals', icon: 'north_east', title: 'Withdrawals', desc: 'Approvals' },
  { href: '/transactions', icon: 'receipt_long', title: 'Ledger', desc: 'Wallet activity' },
  { href: '/integration', icon: 'api', title: 'Integration', desc: 'API & partner' },
  { href: '/support', icon: 'support_agent', title: 'Support', desc: 'Tickets' },
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
    queryFn: () => depositsApi.getBusinessDeposits({ page: 1, limit: 5, sort: 'newest' }),
    enabled: !!business,
  });

  const { data: recentWithdrawals } = useQuery({
    queryKey: ['business-withdrawals-recent'],
    queryFn: () => withdrawalsApi.getBusinessWithdrawals({ page: 1, limit: 5, sort: 'newest' }),
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
        <h1 className="text-xl font-bold">Dashboard load nahi hua</h1>
        <p className="text-sm text-on-surface-variant">
          {getApiErrorMessage(businessError, 'Business profile load fail')}
        </p>
        <Button onClick={() => void refetchBusiness()}>Retry</Button>
      </div>
    );
  }

  if (noBusiness || !business) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Business Dashboard"
          description="Pehle business profile banao — code aur invite link yahin milenge"
        />
        <Card className="border-secondary/30 bg-gradient-to-br from-secondary-container/20 to-surface-container-lowest">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-secondary">
                Setup required
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-headline)] text-2xl font-bold">
                Business profile missing
              </h2>
              <p className="mt-2 max-w-xl text-sm text-on-surface-variant">
                Profile pe business create karo. Referral / business code auto generate hoga, phir
                users invite karke withdrawals approve kar sakte ho.
              </p>
            </div>
            <Link href="/profile?setup=1">
              <Button size="lg">Create business</Button>
            </Link>
          </div>
        </Card>
        <Card title="Next steps">
          <ol className="space-y-3 text-sm">
            {[
              'Profile pe business name save karke code generate karo',
              'Invite link / code users ko share karo',
              'Pending withdrawals approve karo',
              'Optional: Integration pe API keys / partner URLs set karo',
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
      </div>
    );
  }

  const inviteLink = `${USER_APP_URL}/register?code=${encodeURIComponent(business.referralCode || '')}`;
  const pendingDeposits = overview?.pendingDeposits ?? 0;
  const pendingWithdrawals = overview?.pendingWithdrawals ?? 0;
  const needsAttention = pendingDeposits + pendingWithdrawals;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <PageHeader
        title={business.name}
        description="Users, money flow, aur float wallet"
        action={<StatusBadge status={business.status} />}
      />

      {business.status === 'pending' && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 sm:px-4 sm:py-3 sm:text-sm">
          Status <strong>pending</strong> — admin approval ke baad full production.
        </div>
      )}

      {business.referralCode ? (
        <Card
          title="Invite users"
          action={
            <Link href="/withdrawals?status=pending">
              <Button size="sm" variant="ghost" className="!px-2 text-xs sm:!px-3">
                Withdrawals
              </Button>
            </Link>
          }
        >
          <p className="mb-3 text-xs text-on-surface-variant sm:mb-4 sm:text-sm">
            Code / link share karo — user aapke business se link ho jayega.
          </p>
          <div className="space-y-2.5 sm:space-y-3">
            <CopyField label="Business code" value={business.referralCode} />
            <CopyField label="Invite link" value={inviteLink} />
            <a
              href={inviteLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline sm:gap-1.5 sm:text-sm"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              Open invite page
            </a>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="bg-gradient-to-br from-secondary-container/25 via-surface-container-lowest to-primary-container/10 p-3 sm:p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-xs">
                  Float wallet
                </p>
                <p className="mt-1 font-[family-name:var(--font-headline)] text-3xl font-bold text-secondary sm:mt-2 sm:text-4xl md:text-5xl">
                  {formatCurrency(walletBalance?.availableBalance ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-on-surface-variant sm:mt-1 sm:text-sm">
                  Available balance
                </p>
              </div>
              <Link href="/transactions">
                <Button variant="secondary" size="sm">
                  Ledger
                </Button>
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3">
              <MiniStat label="Locked" value={formatCurrency(walletBalance?.lockedBalance ?? 0)} />
              <MiniStat
                label="Deposit vol."
                value={formatCurrency(overview?.totalDepositAmount ?? 0)}
              />
              <MiniStat
                label="Withdraw vol."
                value={formatCurrency(overview?.totalWithdrawals ?? 0)}
              />
            </div>
          </div>
        </Card>

        <Card title="Needs attention">
          <div className="space-y-2 sm:space-y-3">
            <AttentionRow
              href="/deposits?status=pending"
              icon="south_west"
              label="Pending deposits"
              count={pendingDeposits}
            />
            <AttentionRow
              href="/withdrawals?status=pending"
              icon="north_east"
              label="Open withdrawals"
              count={pendingWithdrawals}
            />
            <p className="rounded-xl bg-surface-container-low px-3 py-2.5 text-xs text-on-surface-variant sm:py-3 sm:text-sm">
              {needsAttention
                ? `${needsAttention} open — review karo.`
                : 'All clear — kuch pending nahi.'}
            </p>
          </div>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 font-[family-name:var(--font-headline)] text-base font-bold sm:mb-4 sm:text-lg">
          Live statistics
        </h2>
        {loadingOverview ? (
          <LoadingScreen />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
            <StatCard
              label="Total Users"
              value={overview?.totalUsers ?? 0}
              icon="group"
              trend="API / invite"
              variant="success"
            />
            <StatCard
              label="Deposits"
              value={overview?.depositCount ?? 0}
              icon="south_west"
              trend={`${overview?.completedDeposits ?? 0} done · ${pendingDeposits} open`}
              variant={pendingDeposits ? 'warning' : 'default'}
            />
            <StatCard
              label="Deposit vol."
              value={formatCurrency(overview?.totalDepositAmount ?? 0)}
              icon="payments"
              variant="success"
            />
            <StatCard
              label="Withdrawals"
              value={overview?.withdrawalCount ?? 0}
              icon="north_east"
              trend={`${overview?.completedWithdrawals ?? 0} done · ${pendingWithdrawals} open`}
              variant={pendingWithdrawals ? 'warning' : 'default'}
            />
            <StatCard
              label="Withdraw vol."
              value={formatCurrency(overview?.totalWithdrawals ?? 0)}
              icon="payments"
            />
            <StatCard
              label="Commission"
              value={formatCurrency(overview?.totalCommissionEarned ?? 0)}
              icon="savings"
              trend={`Rate ${overview?.commissionRate ?? business.commissionRate}%`}
            />
            <StatCard
              label="Pay limit"
              value={
                (stats?.p2pPayLimit ?? 0) > 0
                  ? formatCurrency(stats?.p2pPayLimit ?? 0)
                  : 'Unlimited'
              }
              icon="tune"
              trend={
                stats?.p2pPayRemaining == null
                  ? `Used ${formatCurrency(stats?.p2pPayUsed ?? 0)}`
                  : `Left ${formatCurrency(stats.p2pPayRemaining)}`
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

      <section className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <ActivityCard
          title="Recent users"
          href="/users"
          empty="Abhi koi user linked nahi"
          items={(recentUsers?.items ?? []).map((u) => ({
            id: u._id,
            primary: u.name,
            secondary: u.email,
            status: u.status,
          }))}
        />
        <ActivityCard
          title="Recent deposits"
          href="/deposits"
          empty="Abhi koi deposit nahi"
          items={(recentDeposits?.items ?? []).map((d) => {
            const user = resolveUser(d.userId);
            return {
              id: d._id,
              primary: formatCurrency(d.amount, d.currency),
              secondary: `${user.name} · ${formatDate(d.createdAt)}`,
              status: d.status,
            };
          })}
        />
        <ActivityCard
          title="Recent withdrawals"
          href="/withdrawals"
          empty="Abhi koi withdrawal nahi"
          items={(recentWithdrawals?.items ?? []).map((w) => {
            const user = resolveUser(w.userId);
            return {
              id: w._id,
              primary: formatCurrency(w.amount, w.currency),
              secondary: `${user.name} · ${formatDate(w.createdAt)}`,
              status: w.status,
            };
          })}
        />
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
        {QUICK_LINKS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition active:scale-[0.98] hover:border-secondary/40 hover:shadow-md">
              <div className="flex flex-col items-center gap-1 text-center sm:gap-1.5">
                <span className="material-symbols-outlined text-xl text-secondary sm:text-2xl">
                  {item.icon}
                </span>
                <p className="text-[11px] font-semibold leading-tight sm:text-sm">{item.title}</p>
                <p className="hidden text-[11px] text-on-surface-variant sm:block">{item.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <Card
        title="API credentials"
        action={
          <Link href="/integration">
            <Button variant="secondary" size="sm" className="!px-2 text-xs sm:!px-3">
              Manage
            </Button>
          </Link>
        }
      >
        {business.apiKey ? (
          <CopyField label="API Key" value={business.apiKey} />
        ) : (
          <p className="text-xs text-on-surface-variant sm:text-sm">
            API key nahi hai — Integration pe generate karo.
          </p>
        )}
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low/90 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase text-on-surface-variant">{label}</p>
      <p className="mt-0.5 font-bold">{value}</p>
    </div>
  );
}

function AttentionRow({
  href,
  icon,
  label,
  count,
}: {
  href: string;
  icon: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-outline-variant px-3 py-3 transition hover:bg-surface-container-low"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-secondary">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={`text-lg font-bold ${count ? 'text-amber-700' : ''}`}>{count}</span>
    </Link>
  );
}

function ActivityCard({
  title,
  href,
  empty,
  items,
}: {
  title: string;
  href: string;
  empty: string;
  items: { id: string; primary: string; secondary: string; status: string }[];
}) {
  return (
    <Card
      title={title}
      action={
        <Link href={href} className="text-sm font-semibold text-secondary hover:underline">
          View all
        </Link>
      }
    >
      {!items.length ? (
        <p className="text-sm text-on-surface-variant">{empty}</p>
      ) : (
        <ul className="divide-y divide-outline-variant/50">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.primary}</p>
                <p className="truncate text-xs text-on-surface-variant">{item.secondary}</p>
              </div>
              <StatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
