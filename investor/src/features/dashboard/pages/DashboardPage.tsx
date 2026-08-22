'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { investorApi } from '@/features/investor/api/investor.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { StatCard } from '@/shared/components/ui/Card';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { formatCurrency, apiErrorMessage } from '@/shared/lib/utils';

export function DashboardPage() {
  const {
    data: portfolio,
    isLoading: loadingPortfolio,
    isError: portfolioError,
    error: portfolioErr,
    refetch: refetchPortfolio,
  } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => investorApi.getPortfolio(),
  });

  const { data: balance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance(),
  });

  const { data: investments } = useQuery({
    queryKey: ['investments', 1],
    queryFn: () => investorApi.getInvestments({ page: 1, limit: 20 }),
  });

  const { data: redemptions } = useQuery({
    queryKey: ['redemptions', 1],
    queryFn: () => investorApi.getRedemptions({ page: 1, limit: 20 }),
  });

  const pendingInvestments =
    investments?.items.filter((i) => i.status === 'pending').length ?? 0;
  const pendingRedemptions =
    redemptions?.items.filter((r) => r.status === 'pending').length ?? 0;

  if (loadingPortfolio) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold text-on-background md:text-3xl">
          Dashboard
        </h1>
        <p className="text-on-surface-variant">Your investment portfolio overview</p>
      </div>

      {portfolioError ? (
        <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-4">
          <p className="text-sm font-medium text-on-surface">
            {apiErrorMessage(portfolioErr, 'Could not load portfolio')}
          </p>
          <Button type="button" className="mt-3" size="sm" onClick={() => void refetchPortfolio()}>
            Retry
          </Button>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Invested"
          value={formatCurrency(portfolio?.totalInvested ?? 0)}
          icon="savings"
          variant="success"
        />
        <StatCard
          label="Redeemable"
          value={formatCurrency(portfolio?.redeemableAmount ?? balance?.redeemableAmount ?? 0)}
          icon="payments"
          trend="Available to withdraw"
        />
        <StatCard
          label="Wallet Balance"
          value={formatCurrency(portfolio?.balance ?? balance?.availableBalance ?? 0)}
          icon="account_balance_wallet"
        />
        <StatCard
          label="Total Redeemed"
          value={formatCurrency(portfolio?.totalRedeemed ?? 0)}
          icon="history"
        />
        <StatCard
          label="Locked Balance"
          value={formatCurrency(portfolio?.lockedBalance ?? 0)}
          icon="lock"
          variant={portfolio?.lockedBalance ? 'warning' : 'default'}
        />
        <StatCard
          label="Pending Requests"
          value={pendingInvestments + pendingRedemptions}
          icon="pending"
          variant={pendingInvestments + pendingRedemptions ? 'warning' : 'default'}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/invest"
              className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant p-4 transition-colors hover:bg-surface-container-low active:scale-95"
            >
              <span className="material-symbols-outlined text-2xl text-secondary">add_chart</span>
              <span className="text-sm font-semibold">New Investment</span>
            </Link>
            <Link
              href="/redeem"
              className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant p-4 transition-colors hover:bg-surface-container-low active:scale-95"
            >
              <span className="material-symbols-outlined text-2xl text-secondary">payments</span>
              <span className="text-sm font-semibold">Redeem Funds</span>
            </Link>
            <Link
              href="/investments"
              className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant p-4 transition-colors hover:bg-surface-container-low active:scale-95"
            >
              <span className="material-symbols-outlined text-2xl text-secondary">list_alt</span>
              <span className="text-sm font-semibold">My Investments</span>
            </Link>
            <Link
              href="/redemptions"
              className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant p-4 transition-colors hover:bg-surface-container-low active:scale-95"
            >
              <span className="material-symbols-outlined text-2xl text-secondary">receipt_long</span>
              <span className="text-sm font-semibold">Redemptions</span>
            </Link>
          </div>
        </Card>

        <Card title="Portfolio Summary">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary">trending_up</span>
                <span className="font-medium">Total Deposited</span>
              </div>
              <span className="font-semibold">{formatCurrency(portfolio?.totalDeposited ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary">check_circle</span>
                <span className="font-medium">Redeemable Now</span>
              </div>
              <span className="font-semibold text-on-secondary-container">
                {formatCurrency(portfolio?.redeemableAmount ?? 0)}
              </span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
