'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { StatCard } from '@/shared/components/ui/Card';
import { Card } from '@/shared/components/ui/Card';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { formatCurrency } from '@/shared/lib/utils';
import type { DashboardStats } from '@/shared/types/api.types';
import Link from 'next/link';

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardStats>('/admin/dashboard'),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold text-on-background sm:text-2xl md:text-3xl">
          Dashboard
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">Platform overview & pending actions</p>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Total Users" value={data?.users.total ?? 0} icon="group" trend="Registered users" />
        <StatCard label="Businesses" value={data?.businesses.total ?? 0} icon="business_center" />
        <StatCard label="Investors" value={data?.investors.total ?? 0} icon="savings" />
        <StatCard
          label="Pending Deposits"
          value={data?.deposits.pending ?? 0}
          icon="south_west"
          variant={data?.deposits.pending ? 'warning' : 'default'}
        />
        <StatCard
          label="Pending Withdrawals"
          value={data?.withdrawals.pending ?? 0}
          icon="north_east"
          variant={data?.withdrawals.pending ? 'warning' : 'default'}
        />
        <StatCard
          label="Total Deposits"
          value={formatCurrency(data?.deposits.totalCompleted ?? 0)}
          icon="payments"
          variant="success"
        />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Link
              href="/deposits"
              className="flex flex-col items-center gap-1.5 rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-container-low active:scale-95 sm:gap-2 sm:rounded-xl sm:p-4"
            >
              <span className="material-symbols-outlined text-xl text-secondary sm:text-2xl">south_west</span>
              <span className="text-center text-xs font-semibold sm:text-sm">Review Deposits</span>
            </Link>
            <Link
              href="/withdrawals"
              className="flex flex-col items-center gap-1.5 rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-container-low active:scale-95 sm:gap-2 sm:rounded-xl sm:p-4"
            >
              <span className="material-symbols-outlined text-xl text-secondary sm:text-2xl">north_east</span>
              <span className="text-center text-xs font-semibold sm:text-sm">Review Withdrawals</span>
            </Link>
            <Link
              href="/users"
              className="flex flex-col items-center gap-1.5 rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-container-low active:scale-95 sm:gap-2 sm:rounded-xl sm:p-4"
            >
              <span className="material-symbols-outlined text-xl text-secondary sm:text-2xl">group</span>
              <span className="text-center text-xs font-semibold sm:text-sm">Manage Users</span>
            </Link>
            <Link
              href="/businesses"
              className="flex flex-col items-center gap-1.5 rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-container-low active:scale-95 sm:gap-2 sm:rounded-xl sm:p-4"
            >
              <span className="material-symbols-outlined text-xl text-secondary sm:text-2xl">business_center</span>
              <span className="text-center text-xs font-semibold sm:text-sm">Businesses</span>
            </Link>
          </div>
        </Card>

        <Card title="Platform Health">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="material-symbols-outlined text-secondary">check_circle</span>
                <span className="text-sm font-medium sm:text-base">API Connected</span>
              </div>
              <span className="text-sm text-on-secondary-container">Online</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="material-symbols-outlined text-secondary">account_balance_wallet</span>
                <span className="text-sm font-medium sm:text-base">Total Withdrawn</span>
              </div>
              <span className="text-sm font-semibold sm:text-base">{formatCurrency(data?.withdrawals.totalCompleted ?? 0)}</span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
