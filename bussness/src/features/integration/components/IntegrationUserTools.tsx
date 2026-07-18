'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { businessApi } from '@/features/business/api/business.api';
import { integrationApi, type UserWalletBalance } from '@/features/integration/api/integration.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { getApiErrorMessage } from '@/shared/api/client';
import type { User } from '@/shared/types/api.types';

const USER_APP_URL = process.env.NEXT_PUBLIC_USER_APP_URL || 'http://localhost:5174';

export function IntegrationUserTools({ initialUserId }: { initialUserId?: string }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(initialUserId ?? '');
  const [amount, setAmount] = useState('500');
  const [actionError, setActionError] = useState('');

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['business-users', page],
    queryFn: () => businessApi.getUsers(page),
  });

  useEffect(() => {
    if (initialUserId) setSelectedUserId(initialUserId);
  }, [initialUserId]);

  const filteredUsers = useMemo(() => {
    const items = usersData?.items ?? [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [usersData?.items, search]);

  const { data: balance, isFetching: balanceLoading, refetch: refetchBalance } = useQuery({
    queryKey: ['integration-user-balance', selectedUserId],
    queryFn: () => integrationApi.getUserBalance(selectedUserId),
    enabled: !!selectedUserId,
  });

  const lookupByQuery = useMutation({
    mutationFn: () => {
      const q = lookupQuery.trim();
      const params = q.includes('@') ? { email: q } : { userId: q };
      return integrationApi.lookupUser(params);
    },
    onSuccess: (res) => {
      setActionError('');
      const id = res.user.userId || res.user._id;
      setSelectedUserId(id);
      qc.invalidateQueries({ queryKey: ['integration-user-balance', id] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'User not found')),
  });

  const credit = useMutation({
    mutationFn: () => integrationApi.creditUser(selectedUserId, { amount: Number(amount) }),
    onSuccess: () => {
      setActionError('');
      refetchBalance();
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Credit failed')),
  });

  const debit = useMutation({
    mutationFn: () => integrationApi.debitUser(selectedUserId, { amount: Number(amount) }),
    onSuccess: () => {
      setActionError('');
      refetchBalance();
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Debit failed')),
  });

  const redirectDeposit = useMutation({
    mutationFn: () =>
      integrationApi.redirectDeposit({ userId: selectedUserId, amount: Number(amount) }),
    onSuccess: (res) => window.open(res.redirectUrl, '_blank'),
    onError: (err) => setActionError(getApiErrorMessage(err, 'Deposit failed')),
  });

  const redirectWithdrawal = useMutation({
    mutationFn: () =>
      integrationApi.redirectWithdrawal({ userId: selectedUserId, amount: Number(amount) }),
    onSuccess: (res) => window.open(res.redirectUrl, '_blank'),
    onError: (err) => setActionError(getApiErrorMessage(err, 'Withdrawal failed')),
  });

  const selectedUser = (usersData?.items ?? []).find(
    (u) => (u.userId || u._id) === selectedUserId,
  );
  const busy =
    credit.isPending ||
    debit.isPending ||
    redirectDeposit.isPending ||
    redirectWithdrawal.isPending;

  return (
    <Card title="User Tools">
      <p className="mb-4 text-sm text-on-surface-variant">
        Look up a user, check partner balance, credit or debit funds, and open deposit or withdrawal
        redirects on the user portal.
      </p>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label="Email or User ID"
          value={lookupQuery}
          onChange={(e) => setLookupQuery(e.target.value)}
          placeholder="email@example.com or FinGuard userId"
          className="flex-1"
        />
        <Button
          variant="secondary"
          loading={lookupByQuery.isPending}
          disabled={!lookupQuery.trim()}
          onClick={() => lookupByQuery.mutate()}
        >
          Fetch User + Balance
        </Button>
      </div>

      <Input
        label="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3"
      />

      {usersLoading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-outline-variant p-2">
          {filteredUsers.map((u: User) => (
            <button
              key={u._id}
              type="button"
              onClick={() => setSelectedUserId(u.userId || u._id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                selectedUserId === (u.userId || u._id)
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'hover:bg-surface-container-low'
              }`}
            >
              {u.name} · {u.email}
              <span className="mt-0.5 block font-mono text-[10px] opacity-70">
                {u.userId || u._id}
              </span>
            </button>
          ))}
        </div>
      )}

      {usersData && usersData.totalPages > 1 && (
        <Pagination page={page} totalPages={usersData.totalPages} onPageChange={setPage} />
      )}

      {selectedUserId && (
        <div className="mt-4 space-y-4 border-t border-outline-variant pt-4">
          <BalanceBlock
            user={selectedUser}
            balance={balance}
            loading={balanceLoading}
            onRefresh={() => refetchBalance()}
          />
          <Input
            label="Amount (₹)"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="secondary" disabled={busy} loading={credit.isPending} onClick={() => credit.mutate()}>
              Credit
            </Button>
            <Button variant="secondary" disabled={busy} loading={debit.isPending} onClick={() => debit.mutate()}>
              Debit
            </Button>
            <Button disabled={busy} loading={redirectDeposit.isPending} onClick={() => redirectDeposit.mutate()}>
              Deposit
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              loading={redirectWithdrawal.isPending}
              onClick={() => redirectWithdrawal.mutate()}
            >
              Withdraw
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant">
            Deposit and withdraw open the user portal at {USER_APP_URL}
          </p>
        </div>
      )}

      {actionError && (
        <div className="mt-4 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {actionError}
        </div>
      )}
    </Card>
  );
}

function BalanceBlock({
  user,
  balance,
  loading,
  onRefresh,
}: {
  user?: User;
  balance?: UserWalletBalance;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{user?.name ?? 'User'}</p>
          <p className="text-xs text-on-surface-variant">{user?.email}</p>
          {(user?.userId || user?._id) && (
            <p className="font-mono text-[10px] text-on-surface-variant">
              ID: {user?.userId || user?._id}
            </p>
          )}
          {user?.externalRef && (
            <p className="text-[10px] text-on-surface-variant">
              External: {user.externalRef}
            </p>
          )}
        </div>
        <Button size="sm" variant="secondary" loading={loading} onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      {balance ? (
        <p className="mt-3 text-3xl font-bold text-secondary">
          {balance.currency === 'USDT' || balance.partnerBalance ? '' : '₹'}
          {balance.availableBalance}
          {(balance.currency === 'USDT' || balance.partnerBalance?.currency === 'USDT') && (
            <span className="ml-1 text-lg font-semibold">USDT</span>
          )}
        </p>
      ) : (
        <p className="mt-3 text-sm text-on-surface-variant">
          {loading ? 'Loading…' : 'No balance'}
        </p>
      )}
      {balance?.partnerBalance && (
        <p className="text-xs text-on-surface-variant">
          Partner: {balance.partnerBalance.availableBalance}{' '}
          {balance.partnerBalance.currency} available · {balance.partnerBalance.lockedBalance}{' '}
          locked
        </p>
      )}
    </div>
  );
}
