'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withdrawalsApi } from '@/features/withdrawals/api/withdrawals.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  sanitizeAccountNumber,
  upiIdError,
} from '@/shared/lib/validation';
import type { PaymentMethod, Withdrawal } from '@/shared/types/api.types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
];

const PAGE_SIZES = [5, 10, 20];

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
];

function destinationLine(w: Withdrawal) {
  if (w.method === 'upi' && w.upiDetails?.upiId) {
    return `UPI ${w.upiDetails.upiId}${w.upiDetails.payerName ? ` · ${w.upiDetails.payerName}` : ''}`;
  }
  if (w.method === 'bank' && w.bankDetails?.accountNumber) {
    const b = w.bankDetails;
    return `A/C ${b.accountNumber}${b.ifscCode ? ` · ${b.ifscCode}` : ''}`;
  }
  if (w.method === 'usdt' && w.usdtDetails?.walletAddress) {
    return `USDT ${w.usdtDetails.walletAddress}`;
  }
  return String(w.method).toUpperCase();
}

function AdminWithdrawalForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [upiId, setUpiId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [formError, setFormError] = useState('');

  const { data: platform } = useQuery({
    queryKey: ['platform-wallet'],
    queryFn: () => walletApi.getPlatform(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: withdrawalsApi.createPlatformCommission,
    onSuccess: () => {
      setFormError('');
      setAmount('');
      setUpiId('');
      setPayerName('');
      setAccountNumber('');
      setIfscCode('');
      setAccountHolderName('');
      setBankName('');
      setWalletAddress('');
      setOpen(false);
      onCreated();
    },
    onError: (err) => setFormError(getApiErrorMessage(err, 'Could not submit withdrawal')),
  });

  const inrAvailable = platform?.wallet?.availableBalance ?? 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 1) {
      setFormError('Enter a valid amount');
      return;
    }
    if (method === 'upi') {
      const uErr = upiIdError(upiId);
      const nErr = personNameError(payerName);
      if (uErr || nErr) {
        setFormError(uErr || nErr || 'Invalid UPI details');
        return;
      }
      create.mutate({
        amount: num,
        method: 'upi',
        upiDetails: { upiId: upiId.trim(), payerName: payerName.trim() },
      });
      return;
    }
    if (method === 'bank') {
      const aErr = accountNumberError(accountNumber);
      const iErr = ifscError(ifscCode);
      const hErr = personNameError(accountHolderName);
      const bErr = bankNameError(bankName);
      if (aErr || iErr || hErr || bErr) {
        setFormError(aErr || iErr || hErr || bErr || 'Invalid bank details');
        return;
      }
      create.mutate({
        amount: num,
        method: 'bank',
        bankDetails: {
          accountNumber: sanitizeAccountNumber(accountNumber),
          ifscCode: ifscCode.trim().toUpperCase(),
          accountHolderName: accountHolderName.trim(),
          bankName: bankName.trim(),
        },
      });
      return;
    }
    if (!walletAddress.trim() || walletAddress.trim().length < 10) {
      setFormError('Enter a valid USDT wallet address');
      return;
    }
    create.mutate({
      amount: num,
      method: 'usdt',
      usdtDetails: { walletAddress: walletAddress.trim(), network: 'TRC20' },
    });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">New request</h2>
          <p className="text-xs text-on-surface-variant">
            Withdraw from platform commission wallet (listed for P2P)
          </p>
        </div>
        <Button type="button" size="sm" variant={open ? 'outline' : 'primary'} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide form' : 'Create withdrawal'}
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-outline-variant pt-4">
          <p className="text-xs text-on-surface-variant">
            Available (INR) {formatCurrency(inrAvailable)}
          </p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  method === m.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Input
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={method === 'usdt' ? 'USDT amount' : 'INR amount'}
          />
          {method === 'upi' && (
            <>
              <Input label="UPI ID" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
              <Input
                label="Account holder name"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
              />
            </>
          )}
          {method === 'bank' && (
            <>
              <Input
                label="Account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(sanitizeAccountNumber(e.target.value))}
              />
              <Input
                label="IFSC"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
              />
              <Input
                label="Account holder name"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
              />
              <Input label="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </>
          )}
          {method === 'usdt' && (
            <Input
              label="USDT wallet (TRC20)"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
            />
          )}
          {formError && <p className="text-sm text-error">{formError}</p>}
          <Button type="submit" loading={create.isPending}>
            Submit withdrawal
          </Button>
        </form>
      )}
    </Card>
  );
}

export function MyWithdrawalsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, status, search, sort: 'newest' }),
    [page, limit, status, search],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-my-withdrawals', listQuery],
    queryFn: () => withdrawalsApi.getMine(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
          My Withdrawals
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Your platform commission withdrawal requests
        </p>
      </div>

      <AdminWithdrawalForm
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['admin-my-withdrawals'] });
          qc.invalidateQueries({ queryKey: ['platform-wallet'] });
        }}
      />

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  status === f.value
                    ? 'border-secondary bg-secondary-container text-on-secondary-container'
                    : 'border-outline-variant text-on-surface-variant'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                label="Search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Reference…"
              />
            </div>
            <label className="block text-sm sm:w-36">
              <span className="mb-1 block font-medium text-on-surface-variant">Per page</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
            <p className="text-sm">{getApiErrorMessage(error, 'Could not load withdrawals')}</p>
            <Button type="button" className="mt-3" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all'
                ? 'No withdrawals match your filters'
                : 'No withdrawals yet'
            }
            icon="north_east"
          />
        ) : (
          <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((w) => (
              <div
                key={w._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant p-3 sm:p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{formatCurrency(w.amount, w.currency)}</p>
                    <StatusBadge status={w.status} />
                    <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase">
                      {w.method}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-xs text-on-surface-variant">
                    {w.referenceId} · {destinationLine(w)} · {formatDate(w.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
