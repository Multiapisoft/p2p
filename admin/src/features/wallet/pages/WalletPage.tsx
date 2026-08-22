'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { walletApi } from '../api/wallet.api';
import { PlatformCommissionWithdrawForm } from '../components/PlatformCommissionWithdrawForm';
import { usersApi } from '@/features/users/api/users.api';
import { Card, StatCard } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';
import { LoadingScreen } from '@/shared/components/ui/Icon';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { cn, formatCurrency } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { User } from '@/shared/types/api.types';

type WalletTab = 'platform' | 'adjust' | 'tools';

const TABS: { id: WalletTab; label: string; icon: string }[] = [
  { id: 'platform', label: 'Platform wallet', icon: 'account_balance_wallet' },
  { id: 'adjust', label: 'User adjust', icon: 'person_search' },
  { id: 'tools', label: 'Tools', icon: 'build' },
];

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-primary-container text-on-primary-container',
  sub_admin: 'bg-secondary-container/60 text-on-secondary-container',
  user: 'bg-surface-container-high text-on-surface',
  business: 'bg-secondary-container text-on-secondary-container',
  investor: 'bg-surface-container-high text-on-surface',
};

function looksLikeEmail(value: string) {
  return value.includes('@');
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && !looksLikeEmail(value);
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        ROLE_STYLES[role] || 'bg-surface-container-high text-on-surface',
      )}
    >
      {role.replace('_', ' ')}
    </span>
  );
}

export function WalletPage() {
  const authUser = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<WalletTab>('platform');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState('');

  const visibleTabs = TABS.filter((t) => t.id !== 'tools' || authUser?.role === 'admin');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const findQuery = useQuery({
    queryKey: ['wallet-user-search', search],
    queryFn: () => usersApi.list({ page: 1, limit: 8, search }),
    enabled: search.length >= 3,
  });

  const walletQuery = useQuery({
    queryKey: ['wallet-by-user', selectedUser?._id],
    queryFn: () => walletApi.getByUser(selectedUser!._id),
    enabled: !!selectedUser?._id,
  });

  const adjust = useMutation({
    mutationFn: () => {
      if (!selectedUser?._id) throw new Error('Select a user first');
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 1) throw new Error('Enter a valid amount (min 1)');
      return walletApi.adjust({
        userId: selectedUser._id,
        amount: amt,
        type,
        reason: reason.trim(),
      });
    },
    onSuccess: (res) => {
      setSuccess(
        `Wallet ${res.type}ed ${formatCurrency(res.amount)}. New available: ${formatCurrency(res.availableBalance)}`,
      );
      setAmount('');
      setReason('');
      void walletQuery.refetch();
    },
  });

  const results = findQuery.data?.items ?? [];
  const wallet = walletQuery.data?.wallet;

  const selectUser = (user: User) => {
    setSelectedUser(user);
    setSuccess('');
    adjust.reset();
  };

  const findExactHint = () => {
    if (!search) return null;
    if (looksLikeEmail(search)) return 'email';
    if (looksLikePhone(search)) return 'phone';
    return 'name / email / phone';
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold text-on-background sm:text-2xl md:text-3xl">
            Wallet
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-on-surface-variant">
            Platform commission pool, payout methods, and manual user wallet adjustments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low sm:text-sm"
          >
            <span className="material-symbols-outlined text-base">receipt_long</span>
            Ledger
          </Link>
          <Link
            href="/withdrawals"
            className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low sm:text-sm"
          >
            <span className="material-symbols-outlined text-base">north_east</span>
            Withdrawals
          </Link>
        </div>
      </div>

      <div className="chip-scroll flex gap-1.5 rounded-xl border border-outline-variant bg-surface-container-low p-1 sm:gap-2">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm',
              tab === t.id
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-lowest',
            )}
          >
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'platform' ? <PlatformWalletSection /> : null}
      {tab === 'adjust' ? (
        <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
          <div className="space-y-4 lg:col-span-2">
            <Card title="Find user">
              <div className="space-y-3">
                <Input
                  label="Email, phone or name"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="user@email.com or 9876543210"
                  autoComplete="off"
                />
                {search.length > 0 && search.length < 3 ? (
                  <p className="text-xs text-on-surface-variant">Type at least 3 characters…</p>
                ) : null}
                {findQuery.isFetching ? (
                  <p className="text-xs text-on-surface-variant">Searching…</p>
                ) : null}
                {search.length >= 3 && !findQuery.isFetching && results.length === 0 ? (
                  <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-on-error-container">
                    No user found ({findExactHint()}).
                  </p>
                ) : null}
                {results.length > 0 ? (
                  <ul className="space-y-2">
                    {results.map((u) => {
                      const active = selectedUser?._id === u._id;
                      return (
                        <li key={u._id}>
                          <button
                            type="button"
                            onClick={() => selectUser(u)}
                            className={cn(
                              'flex w-full flex-col gap-2 rounded-xl border px-3 py-3 text-left transition sm:flex-row sm:items-center sm:justify-between',
                              active
                                ? 'border-primary bg-primary-container/30 ring-1 ring-primary'
                                : 'border-outline-variant bg-surface-container-low hover:border-primary/40',
                            )}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{u.name}</p>
                              <p className="truncate text-xs text-on-surface-variant">{u.email}</p>
                              {u.phone ? (
                                <p className="text-xs text-on-surface-variant">{u.phone}</p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              <RoleBadge role={u.role} />
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                                  u.status === 'active'
                                    ? 'bg-secondary-container/50 text-on-secondary-container'
                                    : 'bg-surface-container-high text-on-surface-variant',
                                )}
                              >
                                {u.status}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </Card>

            {selectedUser ? (
              <Card title="Selected user">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{selectedUser.name}</p>
                    <RoleBadge role={selectedUser.role} />
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-on-surface-variant">Email</dt>
                      <dd className="break-all font-medium">{selectedUser.email}</dd>
                    </div>
                    <div>
                      <dt className="text-on-surface-variant">Phone</dt>
                      <dd className="font-medium">{selectedUser.phone || '—'}</dd>
                    </div>
                  </dl>
                  {walletQuery.isLoading ? <LoadingScreen /> : null}
                  {walletQuery.isError ? (
                    <p className="text-sm text-on-error-container">
                      {getApiErrorMessage(walletQuery.error, 'Wallet load failed')}
                    </p>
                  ) : null}
                  {wallet ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <MiniWalletStat label="Balance" value={formatCurrency(wallet.balance)} />
                      <MiniWalletStat label="Locked" value={formatCurrency(wallet.lockedBalance)} />
                      <MiniWalletStat
                        label="Available"
                        value={formatCurrency(wallet.availableBalance)}
                        highlight
                      />
                    </div>
                  ) : null}
                </div>
              </Card>
            ) : (
              <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low/50 px-4 py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant">
                  person_search
                </span>
                <p className="mt-2 text-sm font-medium">Select a user to adjust wallet</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Search by email, phone, or name on the left.
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-3">
            <Card
              title="Adjust balance"
              action={
                selectedUser ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedUser(null);
                      setSuccess('');
                    }}
                  >
                    Clear
                  </Button>
                ) : null
              }
            >
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSuccess('');
                  adjust.mutate();
                }}
              >
                {!selectedUser ? (
                  <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-4 py-10 text-center">
                    <p className="text-sm text-on-surface-variant">
                      Find and select a user first.
                    </p>
                  </div>
                ) : (
                  <>
                    <Input
                      label="Amount (INR)"
                      type="number"
                      min={1}
                      step={1}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                    <div>
                      <p className="mb-2 text-sm font-semibold">Adjustment type</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['credit', 'debit'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setType(t)}
                            className={cn(
                              'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold capitalize transition',
                              type === t
                                ? t === 'credit'
                                  ? 'border-secondary bg-secondary-container text-on-secondary-container'
                                  : 'border-error bg-error-container/30 text-on-error-container'
                                : 'border-outline-variant bg-surface-container-low hover:bg-surface-container',
                            )}
                          >
                            <span className="material-symbols-outlined text-lg">
                              {t === 'credit' ? 'add_circle' : 'remove_circle'}
                            </span>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Textarea
                      label="Reason (audit trail)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this adjustment being made?"
                      required
                    />
                  </>
                )}
                {success ? (
                  <div className="rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
                    {success}
                  </div>
                ) : null}
                {adjust.isError ? (
                  <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                    {getApiErrorMessage(adjust.error, 'Failed to adjust wallet')}
                  </div>
                ) : null}
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  loading={adjust.isPending}
                  disabled={!selectedUser || !reason.trim() || !amount}
                  variant={type === 'debit' ? 'danger' : 'primary'}
                >
                  Apply {type}
                </Button>
              </form>
            </Card>
          </div>
        </div>
      ) : null}
      {tab === 'tools' && authUser?.role === 'admin' ? <ResetTxnDataCard /> : null}
    </div>
  );
}

function MiniWalletStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5',
        highlight
          ? 'border-secondary/40 bg-secondary-container/20'
          : 'border-outline-variant bg-surface-container-low',
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}

function FlowHint({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-3">
      <span className="material-symbols-outlined shrink-0 text-xl text-secondary">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-on-surface-variant">{body}</p>
      </div>
    </div>
  );
}

function PlatformWalletSection() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['platform-wallet'],
    queryFn: () => walletApi.getPlatform(),
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) {
    return (
      <Card title="Platform wallet">
        <p className="text-sm text-on-error-container">
          {getApiErrorMessage(error, 'Could not load platform wallet')}
        </p>
      </Card>
    );
  }
  if (!data) return null;

  const locked = data.wallet.lockedBalance ?? 0;
  const available = data.wallet.availableBalance;
  const balance = data.wallet.balance;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-primary-container/40 via-surface-container-low to-secondary-container/30 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Platform commission wallet
            </p>
            <p className="mt-1 font-[family-name:var(--font-headline)] text-2xl font-bold sm:text-3xl">
              {formatCurrency(available)}
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">Available to withdraw</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest/80 px-3 py-1 text-xs">
              <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
              {data.admin.name} · {data.admin.email}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:max-w-md">
            <MiniWalletStat label="Balance" value={formatCurrency(balance)} />
            <MiniWalletStat label="Locked" value={formatCurrency(locked)} />
            <MiniWalletStat label="Available" value={formatCurrency(available)} highlight />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total balance"
          value={formatCurrency(balance)}
          icon="account_balance"
          trend="Fees in + deposits given"
        />
        <StatCard
          label="Locked"
          value={formatCurrency(locked)}
          icon="lock"
          variant={locked > 0 ? 'warning' : 'default'}
          trend="Pending commission withdrawals"
        />
        <StatCard
          label="Available"
          value={formatCurrency(available)}
          icon="payments"
          variant="success"
          trend="Ready to withdraw"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <FlowHint
          icon="percent"
          title="Commission earned"
          body="Platform & business fees credit this wallet. See Ledger → Commission filter."
        />
        <FlowHint
          icon="south_west"
          title="Deposit given"
          body="When you mark-paid a withdrawal, deposit given entries appear in Ledger."
        />
        <FlowHint
          icon="north_east"
          title="Withdraw commission"
          body="Submit a request below — it lists on Withdrawals for P2P pay."
        />
      </section>

      <Card title="Payout & withdraw">
        <PlatformCommissionWithdrawForm available={available} />
      </Card>
    </div>
  );
}

function ResetTxnDataCard() {
  type LookupMode = 'email' | 'phone' | 'id';
  type EntityType = 'user' | 'investor' | 'business';

  const ENTITY_OPTIONS: {
    value: EntityType;
    label: string;
    hint: string;
    icon: string;
  }[] = [
    { value: 'user', label: 'User', hint: 'End-user wallet + open txns', icon: 'person' },
    { value: 'investor', label: 'Investor', hint: 'Investor wallet + open txns', icon: 'savings' },
    {
      value: 'business',
      label: 'Business',
      hint: 'Owner + linked referral users',
      icon: 'business_center',
    },
  ];

  const [entityType, setEntityType] = useState<EntityType>('user');
  const [lookupMode, setLookupMode] = useState<LookupMode>('email');
  const [lookupValue, setLookupValue] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState('');

  const roleForType =
    entityType === 'investor' ? 'investor' : entityType === 'business' ? 'business' : 'user';

  const searchTerm =
    lookupMode !== 'id' && lookupValue.trim().length >= 3 ? lookupValue.trim() : '';

  const previewQuery = useQuery({
    queryKey: ['reset-txn-preview', entityType, searchTerm],
    queryFn: () =>
      usersApi.list({
        page: 1,
        limit: 6,
        search: searchTerm,
        role: roleForType,
      }),
    enabled: lookupMode !== 'id' && searchTerm.length >= 3 && !selectedUser,
  });

  const reset = useMutation({
    mutationFn: () => {
      const payload = {
        entityType,
        confirm: confirm.trim(),
        ...(lookupMode === 'email'
          ? { email: (selectedUser?.email || lookupValue).trim() }
          : lookupMode === 'phone'
            ? { phone: (selectedUser?.phone || lookupValue).trim() }
            : { entityId: lookupValue.trim() }),
      };
      return walletApi.resetTxnData(payload);
    },
    onSuccess: (res) => {
      setResult(
        `Reset complete — ${res.users} user(s), ${res.cancelledWithdrawals} withdrawals cancelled, ${res.cancelledDeposits} deposits cancelled.`,
      );
      setConfirm('');
      setLookupValue('');
      setSelectedUser(null);
    },
  });

  const previewItems = previewQuery.data?.items ?? [];
  const canSubmit =
    confirm === 'RESET' &&
    (lookupMode === 'id'
      ? lookupValue.trim().length > 0
      : !!selectedUser || lookupValue.trim().length > 0);

  const pickUser = (user: User) => {
    setSelectedUser(user);
    setLookupValue(lookupMode === 'phone' ? user.phone || '' : user.email);
    setResult('');
  };

  const clearSelection = () => {
    setSelectedUser(null);
    setLookupValue('');
    setResult('');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
      <Card title="What gets reset" className="lg:col-span-2">
        <div className="space-y-3">
          <div className="rounded-xl border border-error/25 bg-error-container/10 p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-2xl text-error">warning</span>
              <div>
                <p className="font-semibold text-on-error-container">Danger zone</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Super admin only. This cannot be undone easily.
                </p>
              </div>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-on-surface-variant">
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-base text-error">cancel</span>
              Cancels pending / processing withdrawals
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-base text-error">cancel</span>
              Cancels pending deposits
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-base text-error">account_balance_wallet</span>
              Zeros affected wallet balances
            </li>
            <li className="flex gap-2">
              <span className="material-symbols-outlined text-base text-secondary">groups</span>
              Business also resets linked referral users
            </li>
          </ul>
        </div>
      </Card>

      <Card title="Reset transaction data" className="lg:col-span-3">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Step 1 · Entity type
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {ENTITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setEntityType(opt.value);
                    clearSelection();
                  }}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    entityType === opt.value
                      ? 'border-primary bg-primary-container/40 ring-1 ring-primary'
                      : 'border-outline-variant bg-surface-container-low hover:border-primary/30',
                  )}
                >
                  <span className="material-symbols-outlined text-xl text-secondary">{opt.icon}</span>
                  <p className="mt-2 text-sm font-semibold">{opt.label}</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Step 2 · Find entity
            </p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'email' as const, label: 'Email', icon: 'mail' },
                  { id: 'phone' as const, label: 'Phone', icon: 'call' },
                  { id: 'id' as const, label: 'Object ID', icon: 'fingerprint' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setLookupMode(mode.id);
                    clearSelection();
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
                    lookupMode === mode.id
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant text-on-surface-variant',
                  )}
                >
                  <span className="material-symbols-outlined text-sm">{mode.icon}</span>
                  {mode.label}
                </button>
              ))}
            </div>

            <Input
              label={
                lookupMode === 'email'
                  ? 'Email address'
                  : lookupMode === 'phone'
                    ? 'Phone number'
                    : 'Mongo ObjectId'
              }
              value={lookupValue}
              onChange={(e) => {
                setLookupValue(e.target.value);
                setSelectedUser(null);
                setResult('');
              }}
              placeholder={
                lookupMode === 'email'
                  ? 'user@email.com'
                  : lookupMode === 'phone'
                    ? '9876543210'
                    : '507f1f77bcf86cd799439011'
              }
              autoComplete="off"
            />

            {lookupMode !== 'id' && lookupValue.trim().length > 0 && lookupValue.trim().length < 3 ? (
              <p className="mt-2 text-xs text-on-surface-variant">Type at least 3 characters to search…</p>
            ) : null}

            {selectedUser ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary/30 bg-secondary-container/20 px-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{selectedUser.name}</p>
                  <p className="text-xs text-on-surface-variant">{selectedUser.email}</p>
                  {selectedUser.phone ? (
                    <p className="text-xs text-on-surface-variant">{selectedUser.phone}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={selectedUser.role} />
                  <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                    Change
                  </Button>
                </div>
              </div>
            ) : null}

            {!selectedUser && previewQuery.isFetching ? (
              <p className="mt-2 text-xs text-on-surface-variant">Searching…</p>
            ) : null}

            {!selectedUser && lookupMode !== 'id' && searchTerm && !previewQuery.isFetching ? (
              previewItems.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {previewItems.map((u) => (
                    <li key={u._id}>
                      <button
                        type="button"
                        onClick={() => pickUser(u)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5 text-left transition hover:border-primary/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{u.name}</p>
                          <p className="truncate text-xs text-on-surface-variant">{u.email}</p>
                        </div>
                        <RoleBadge role={u.role} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">
                  No matching {entityType} found. You can still submit if the email/phone is exact.
                </p>
              )
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Step 3 · Confirm
            </p>
            <Input
              label='Type "RESET" to confirm'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="RESET"
            />
          </div>

          {result ? (
            <div className="rounded-xl bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
              {result}
            </div>
          ) : null}
          {reset.isError ? (
            <div className="rounded-xl bg-error-container px-4 py-3 text-sm text-on-error-container">
              {getApiErrorMessage(reset.error, 'Reset failed')}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-outline-variant pt-4">
            <Button
              type="button"
              variant="danger"
              loading={reset.isPending}
              disabled={!canSubmit}
              onClick={() => {
                setResult('');
                reset.mutate();
              }}
            >
              Reset transaction data
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={reset.isPending}
              onClick={() => {
                clearSelection();
                setConfirm('');
                setResult('');
              }}
            >
              Clear form
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
