'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withdrawalsApi } from '../api/withdrawals.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import { formatSecondsMmSs } from '@/shared/lib/upi-qr';
import type {
  CreateWithdrawalPayload,
  PaymentMethod,
  Withdrawal,
} from '@/shared/types/api.types';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'usdt', label: 'USDT' },
];

export function WithdrawalsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [network, setNetwork] = useState('TRC20');
  const [formError, setFormError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: balance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance(),
  });

  const listQuery = useMemo(() => ({ page, limit, sort: 'newest' }), [page, limit]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['my-withdrawals', listQuery],
    queryFn: () => withdrawalsApi.getMy(listQuery),
  });

  const resetForm = () => {
    setAmount('');
    setUpiId('');
    setPayerName('');
    setAccountNumber('');
    setIfscCode('');
    setAccountHolderName('');
    setBankName('');
    setWalletAddress('');
    setNetwork('TRC20');
    setFormError('');
  };

  const create = useMutation({
    mutationFn: (payload: CreateWithdrawalPayload) => withdrawalsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      setShowForm(false);
      resetForm();
    },
    onError: (err: unknown) => {
      setFormError(apiErrorMessage(err, 'Withdrawal failed'));
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => withdrawalsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });

  const available = balance?.availableBalance ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const num = Number(amount);
    if (!num || num < 1) {
      setFormError('Enter a valid amount');
      return;
    }
    if (num > available) {
      setFormError(`Insufficient balance (${formatCurrency(available)})`);
      return;
    }

    const payload: CreateWithdrawalPayload = { amount: num, method };
    if (method === 'upi') {
      if (!upiId.trim()) {
        setFormError('UPI ID required');
        return;
      }
      payload.upiDetails = { upiId: upiId.trim(), payerName: payerName.trim() || undefined };
    } else if (method === 'bank') {
      if (!accountNumber.trim() || !ifscCode.trim() || !accountHolderName.trim()) {
        setFormError('Account number, IFSC and holder name required');
        return;
      }
      payload.bankDetails = {
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim() || undefined,
      };
    } else {
      if (!walletAddress.trim()) {
        setFormError('USDT wallet address required');
        return;
      }
      payload.usdtDetails = {
        walletAddress: walletAddress.trim(),
        network: network.trim() || 'TRC20',
      };
    }
    create.mutate(payload);
  };

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  useEffect(() => {
    if (!showForm) resetForm();
  }, [showForm]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold">
            My Withdrawals
          </h1>
          <p className="text-sm text-on-surface-variant">
            Open a payout request (UPI / Bank / USDT). Others can fulfill it on Invest.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'New Withdrawal'}
        </Button>
      </div>

      <div className="rounded-xl border border-secondary/25 bg-secondary-container/15 p-4">
        <p className="text-xs text-on-surface-variant">Available balance</p>
        <p className="text-2xl font-bold text-secondary">{formatCurrency(available)}</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          USDT method: enter INR amount — open request converts to USDT at live rate.
        </p>
        <p className="mt-2 text-[11px] text-on-surface-variant">
          Once listed for Platform Payment / approved by business, you cannot cancel. Contact
          business/admin.
        </p>
      </div>

      {showForm && (
        <Card>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <p className="mb-2 text-sm font-semibold">Payout method</p>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                      method === m.value
                        ? 'bg-primary text-on-primary'
                        : 'border border-outline-variant'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label={method === 'usdt' ? 'Amount (INR → USDT open)' : 'Amount (INR)'}
              type="number"
              min={1}
              max={available}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />

            {method === 'upi' && (
              <>
                <Input
                  label="UPI ID *"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="name@upi"
                  required
                />
                <Input
                  label="Name (optional)"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                />
              </>
            )}

            {method === 'bank' && (
              <>
                <Input
                  label="Account number *"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                />
                <Input
                  label="IFSC *"
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  required
                />
                <Input
                  label="Account holder *"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  required
                />
                <Input
                  label="Bank name (optional)"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </>
            )}

            {method === 'usdt' && (
              <>
                <Input
                  label="USDT wallet address *"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  required
                />
                <Input
                  label="Network"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                  placeholder="TRC20"
                />
              </>
            )}

            {formError && (
              <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full" loading={create.isPending} disabled={available <= 0}>
              Submit Withdrawal
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No withdrawals yet" icon="north_east" />
        ) : (
          <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((w: Withdrawal) => {
              const canCancel = w.userCanCancel === true;
              const tatLeft =
                w.userEditExpiresAt != null
                  ? Math.max(
                      0,
                      Math.ceil((new Date(w.userEditExpiresAt).getTime() - now) / 1000),
                    )
                  : w.tatSecondsRemaining ?? 0;
              return (
              <div key={w._id} className="rounded-xl border border-outline-variant p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {formatCurrency(w.amount, w.currency)}
                      {w.sourceAmount != null && w.currency === 'USDT' ? (
                        <span className="ml-1 text-xs font-normal text-on-surface-variant">
                          (locked {formatCurrency(w.sourceAmount, 'INR')})
                        </span>
                      ) : null}
                    </p>
                    <p className="font-mono text-[11px] text-on-surface-variant">
                      {w.referenceId} · {w.method.toUpperCase()} · {formatDate(w.createdAt)}
                    </p>
                    {w.method === 'upi' && w.upiDetails?.upiId && (
                      <p className="mt-1 text-xs">UPI: {w.upiDetails.upiId}</p>
                    )}
                    {w.method === 'bank' && w.bankDetails?.accountNumber && (
                      <p className="mt-1 text-xs">
                        Bank: ****{w.bankDetails.accountNumber.slice(-4)} · {w.bankDetails.ifscCode}
                      </p>
                    )}
                    {w.method === 'usdt' && w.usdtDetails?.walletAddress && (
                      <p className="mt-1 break-all text-xs">
                        {w.usdtDetails.network || 'TRC20'}: {w.usdtDetails.walletAddress}
                      </p>
                    )}
                    {(w.status === 'pending' || w.status === 'processing') && canCancel && tatLeft > 0 && (
                      <p className="mt-1 text-[11px] font-medium text-secondary">
                        You can cancel for {formatSecondsMmSs(tatLeft)}
                      </p>
                    )}
                    {(w.status === 'pending' || w.status === 'processing') && !canCancel && (
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        Once listed for Platform Payment / approved by business, you cannot cancel.
                        Contact business/admin.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={w.status} />
                    {canCancel && (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={cancel.isPending}
                          onClick={() => cancel.mutate(w._id)}
                        >
                          Cancel
                        </Button>
                      )}
                  </div>
                </div>
              </div>
              );
            })}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
