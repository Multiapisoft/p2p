'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { StatCard } from '@/shared/components/ui/Card';
import { Card } from '@/shared/components/ui/Card';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { formatCurrency } from '@/shared/lib/utils';

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

  if (balanceLoading || walletsLoading) return <LoadingScreen />;

  const inrWallet = wallets?.find((w) => w.currency === 'INR');
  const isPartner = balance?.source === 'partner';
  const displayCurrency = balance?.currency || 'INR';
  const pendingLocked = inrWallet?.lockedBalance ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold text-on-background sm:text-2xl md:text-3xl">
          Hello{user?.email ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="text-sm text-on-surface-variant">
          {isPartner ? 'Partner wallet overview' : 'Your wallet overview'}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:gap-4">
        <StatCard
          label="Available Balance"
          value={formatCurrency(balance?.availableBalance ?? 0, displayCurrency)}
          icon="account_balance_wallet"
          variant="success"
        />
        <StatCard
          label={isPartner ? 'Redeemable' : 'Redeemable'}
          value={formatCurrency(balance?.redeemableAmount ?? 0, displayCurrency)}
          icon="savings"
        />

        {isPartner ? (
          <>
            <StatCard
              label="Pending withdrawal"
              value={formatCurrency(pendingLocked, 'INR')}
              icon="hourglass_top"
            />
            {typeof balance?.approxInrAvailable === 'number' ? (
              <StatCard
                label="Approx INR withdrawable"
                value={formatCurrency(balance.approxInrAvailable, 'INR')}
                icon="currency_rupee"
              />
            ) : (
              <StatCard
                label="Completed withdrawn"
                value={formatCurrency(inrWallet?.totalWithdrawn ?? 0, 'INR')}
                icon="north_east"
              />
            )}
          </>
        ) : (
          <>
            {inrWallet && (
              <StatCard
                label="Total Deposited"
                value={formatCurrency(inrWallet.totalDeposited)}
                icon="south_west"
              />
            )}
            {inrWallet && (
              <StatCard
                label="Total Withdrawn"
                value={formatCurrency(inrWallet.totalWithdrawn)}
                icon="north_east"
              />
            )}
          </>
        )}
      </section>

      {isPartner && pendingLocked > 0 && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant sm:text-sm">
          Pending withdrawal locks INR on FinGuard until payout is completed or cancelled. Partner
          available balance already reflects the USDT/INR spend.
        </p>
      )}

      <Card title="Quick Actions">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {[
            { href: '/deposits', icon: 'south_west', label: 'Deposit' },
            { href: '/withdrawals', icon: 'north_east', label: 'Withdraw' },
            { href: '/transactions', icon: 'receipt_long', label: 'Ledger' },
            { href: '/support', icon: 'support_agent', label: 'Support' },
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
