'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { walletApi } from '../api/wallet.api';
import { PlatformCommissionWithdrawForm } from '../components/PlatformCommissionWithdrawForm';
import { usersApi } from '@/features/users/api/users.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { User } from '@/shared/types/api.types';

function looksLikeEmail(value: string) {
  return value.includes('@');
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && !looksLikeEmail(value);
}

export function WalletPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState('');

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
      if (!selectedUser?._id) {
        throw new Error('Select a user first');
      }
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 1) {
        throw new Error('Enter a valid amount (min 1)');
      }
      return walletApi.adjust({
        userId: selectedUser._id,
        amount: amt,
        type,
        reason: reason.trim(),
      });
    },
    onSuccess: (res) => {
      setSuccess(
        `Wallet ${res.type}ed ₹${res.amount}. New available: ₹${res.availableBalance}`,
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
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
          Wallet Adjust
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Find a user by email or phone, then credit or debit. Platform fee, business fee,
          and investor commission also land in the platform admin wallet below. History is
          on Transactions.
        </p>
      </div>

      <PlatformWalletCard />

      <ResetTxnDataCard />

      <Card title="Find User">
        <div className="space-y-3">
          <Input
            label="Email or phone"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="user@email.com or 9876543210"
            autoComplete="off"
          />
          {search.length > 0 && search.length < 3 && (
            <p className="text-xs text-on-surface-variant">Type at least 3 characters…</p>
          )}
          {findQuery.isFetching && (
            <p className="text-xs text-on-surface-variant">Searching…</p>
          )}
          {search.length >= 3 && !findQuery.isFetching && results.length === 0 && (
            <p className="text-sm text-on-error-container">
              No user found ({findExactHint()}).
            </p>
          )}
          {results.length > 0 && (
            <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant">
              {results.map((u) => {
                const active = selectedUser?._id === u._id;
                return (
                  <li key={u._id}>
                    <button
                      type="button"
                      onClick={() => selectUser(u)}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition sm:flex-row sm:items-center sm:justify-between ${
                        active
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-surface-container-lowest hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{u.name}</p>
                        <p className="truncate text-xs opacity-80">{u.email}</p>
                      </div>
                      <div className="shrink-0 text-xs opacity-80 sm:text-right">
                        {u.phone ? <p>{u.phone}</p> : null}
                        <p className="capitalize">
                          {u.role} · {u.status}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {selectedUser && (
        <Card title="Selected User">
          <div className="space-y-3 text-sm">
            <div className="grid gap-1 sm:grid-cols-2">
              <p>
                <span className="text-on-surface-variant">Name:</span> {selectedUser.name}
              </p>
              <p>
                <span className="text-on-surface-variant">Role:</span>{' '}
                <span className="capitalize">{selectedUser.role}</span>
              </p>
              <p className="break-all">
                <span className="text-on-surface-variant">Email:</span> {selectedUser.email}
              </p>
              <p>
                <span className="text-on-surface-variant">Phone:</span>{' '}
                {selectedUser.phone || '—'}
              </p>
            </div>
            {walletQuery.isLoading && (
              <p className="text-xs text-on-surface-variant">Loading wallet…</p>
            )}
            {walletQuery.isError && (
              <p className="text-sm text-on-error-container">
                {getApiErrorMessage(walletQuery.error, 'Wallet load failed')}
              </p>
            )}
            {wallet && (
              <div className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                  {wallet.currency} wallet
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    Balance: <strong>₹{wallet.balance}</strong>
                  </span>
                  <span>
                    Locked: <strong>₹{wallet.lockedBalance}</strong>
                  </span>
                  <span>
                    Available: <strong>₹{wallet.availableBalance}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Adjust Balance">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSuccess('');
            adjust.mutate();
          }}
        >
          {!selectedUser && (
            <p className="rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">
              Find and select a user above first.
            </p>
          )}
          <Input
            label="Amount (INR)"
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            disabled={!selectedUser}
          />
          <div>
            <p className="mb-2 text-sm font-semibold">Type</p>
            <div className="chip-scroll">
              {(['credit', 'debit'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!selectedUser}
                  onClick={() => setType(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize sm:px-4 sm:py-2 sm:text-sm ${
                    type === t
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for adjustment (audit trail)"
            required
            disabled={!selectedUser}
          />
          {success && (
            <div className="rounded-lg bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
              {success}
            </div>
          )}
          {adjust.isError && (
            <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
              {getApiErrorMessage(adjust.error, 'Failed to adjust wallet')}
            </div>
          )}
          <Button
            type="submit"
            className="w-full sm:w-auto"
            loading={adjust.isPending}
            disabled={!selectedUser || !reason.trim() || !amount}
          >
            Apply Adjustment
          </Button>
        </form>
      </Card>
    </div>
  );
}

function ResetTxnDataCard() {
  const user = useAuthStore((s) => s.user);
  const [entityType, setEntityType] = useState<'user' | 'investor' | 'business'>('user');
  const [entityId, setEntityId] = useState('');
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState('');

  const reset = useMutation({
    mutationFn: () =>
      walletApi.resetTxnData({
        entityType,
        entityId: entityId.trim(),
        confirm: confirm.trim(),
      }),
    onSuccess: (res) => {
      setResult(
        `Reset ok — users ${res.users}, cancelled WD ${res.cancelledWithdrawals}, deposits ${res.cancelledDeposits}`,
      );
      setConfirm('');
    },
  });

  if (user?.role !== 'admin') return null;

  return (
    <Card title="Reset transaction data">
      <p className="mb-3 text-sm text-on-surface-variant">
        Zero wallets and cancel open pending deposits/withdrawals for a user, investor, or business
        (linked users). Type <strong>RESET</strong> to confirm. Super admin only.
      </p>
      <div className="space-y-3">
        <div className="chip-scroll">
          {(['user', 'investor', 'business'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEntityType(t)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                entityType === t ? 'bg-primary text-on-primary' : 'border border-outline-variant'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Input
          label="Entity ID"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="Mongo ObjectId"
        />
        <Input
          label='Type RESET to confirm'
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {result ? (
          <p className="rounded-lg bg-secondary-container px-3 py-2 text-sm text-on-secondary-container">
            {result}
          </p>
        ) : null}
        {reset.isError ? (
          <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            {getApiErrorMessage(reset.error, 'Reset failed')}
          </p>
        ) : null}
        <Button
          type="button"
          variant="danger"
          loading={reset.isPending}
          disabled={!entityId.trim() || confirm !== 'RESET'}
          onClick={() => {
            setResult('');
            reset.mutate();
          }}
        >
          Reset txn data
        </Button>
      </div>
    </Card>
  );
}

function PlatformWalletCard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['platform-wallet'],
    queryFn: () => walletApi.getPlatform(),
  });

  return (
    <Card title="Platform wallet (admin)">
      {isLoading && <p className="text-sm text-on-surface-variant">Loading platform wallet…</p>}
      {isError && (
        <p className="text-sm text-on-error-container">
          {getApiErrorMessage(error, 'Could not load platform wallet')}
        </p>
      )}
      {data && (
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-on-surface-variant">Admin:</span> {data.admin.name} ·{' '}
            {data.admin.email}
          </p>
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
              {data.wallet.currency} · platform / business fee in · investor commission out
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Balance: <strong>₹{data.wallet.balance}</strong>
              </span>
              <span>
                Available: <strong>₹{data.wallet.availableBalance}</strong>
              </span>
            </div>
          </div>
          <PlatformCommissionWithdrawForm available={data.wallet.availableBalance} />
        </div>
      )}
    </Card>
  );
}
