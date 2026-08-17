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
import { Modal } from '@/shared/components/ui/Modal';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  upiIdError,
} from '@/shared/lib/validation';
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

function DestinationLine({ w }: { w: Withdrawal }) {
  if (w.method === 'upi' && w.upiDetails?.upiId) {
    const name = w.upiDetails.payerName?.trim();
    return (
      <p className="mt-1 text-xs text-on-surface-variant">
        {name ? `NAME ${name} · ` : ''}UPI {w.upiDetails.upiId}
      </p>
    );
  }
  if (w.method === 'bank' && w.bankDetails?.accountNumber) {
    const b = w.bankDetails;
    const parts = [
      b.accountHolderName ? `NAME ${b.accountHolderName}` : null,
      `A/C ****${b.accountNumber.slice(-4)}`,
      b.ifscCode ? `IFSC ${b.ifscCode}` : null,
      b.bankName ? `BANK ${b.bankName}` : null,
    ].filter(Boolean);
    return <p className="mt-1 text-xs text-on-surface-variant">{parts.join(' · ')}</p>;
  }
  if (w.method === 'usdt' && w.usdtDetails?.walletAddress) {
    return (
      <p className="mt-1 break-all text-xs text-on-surface-variant">
        {w.usdtDetails.network || 'TRC20'}: {w.usdtDetails.walletAddress}
      </p>
    );
  }
  return null;
}

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
  const [pendingPayload, setPendingPayload] = useState<CreateWithdrawalPayload | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    setPendingPayload(null);
    setEditingId(null);
  };

  const startEdit = (w: Withdrawal) => {
    setEditingId(w._id);
    setShowForm(true);
    setMethod(w.method);
    setAmount(String(w.sourceAmount ?? w.amount));
    setUpiId(w.upiDetails?.upiId || '');
    setPayerName(w.upiDetails?.payerName || '');
    setAccountNumber(w.bankDetails?.accountNumber || '');
    setIfscCode(w.bankDetails?.ifscCode || '');
    setAccountHolderName(w.bankDetails?.accountHolderName || '');
    setBankName(w.bankDetails?.bankName || '');
    setWalletAddress(w.usdtDetails?.walletAddress || '');
    setNetwork(w.usdtDetails?.network || 'TRC20');
    setFormError('');
    setPendingPayload(null);
  };

  const create = useMutation({
    mutationFn: (payload: CreateWithdrawalPayload) => withdrawalsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      setPendingPayload(null);
      setShowForm(false);
      resetForm();
    },
    onError: (err: unknown) => {
      setFormError(apiErrorMessage(err, 'Withdrawal failed'));
    },
  });

  const updateDestination = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Pick<CreateWithdrawalPayload, 'upiDetails' | 'bankDetails' | 'usdtDetails'>;
    }) => withdrawalsApi.updateDestination(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
      setPendingPayload(null);
      setShowForm(false);
      resetForm();
    },
    onError: (err: unknown) => {
      setFormError(apiErrorMessage(err, 'Update failed'));
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
    if (num > available && !editingId) {
      setFormError(`Insufficient balance (${formatCurrency(available)})`);
      return;
    }

    const payload: CreateWithdrawalPayload = { amount: num, method };
    if (method === 'upi') {
      const upiErr = upiIdError(upiId);
      if (upiErr) {
        setFormError(upiErr);
        return;
      }
      const nameErr = personNameError(payerName, true);
      if (nameErr) {
        setFormError(nameErr);
        return;
      }
      payload.upiDetails = {
        upiId: upiId.trim(),
        payerName: payerName.trim(),
      };
    } else if (method === 'bank') {
      const accErr = accountNumberError(accountNumber);
      if (accErr) {
        setFormError(accErr);
        return;
      }
      const ifscErr = ifscError(ifscCode);
      if (ifscErr) {
        setFormError(ifscErr);
        return;
      }
      const holderErr = personNameError(accountHolderName);
      if (holderErr) {
        setFormError(holderErr);
        return;
      }
      const bankErr = bankNameError(bankName);
      if (bankErr) {
        setFormError(bankErr);
        return;
      }
      payload.bankDetails = {
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
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
    setPendingPayload(payload);
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
        <Button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              setShowForm(true);
            }
          }}
        >
          {showForm ? 'Close' : editingId ? 'Edit withdrawal' : 'New Withdrawal'}
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
                    onClick={() => {
                      if (!editingId) setMethod(m.value);
                    }}
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
              disabled={!!editingId}
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
                  label="Name *"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  required
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
                  label="Bank name *"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
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

            <Button type="submit" className="w-full" disabled={available <= 0}>
              Review & continue
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
                    <DestinationLine w={w} />
                    {(w.status === 'pending' || w.status === 'processing') && canCancel && tatLeft > 0 && (
                      <p className="mt-1 text-[11px] font-medium text-secondary">
                        You can edit or cancel for {formatSecondsMmSs(tatLeft)}
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
                      <div className="flex flex-col items-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(w)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={cancel.isPending}
                          onClick={() => cancel.mutate(w._id)}
                        >
                          Cancel
                        </Button>
                      </div>
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

      <Modal
        open={!!pendingPayload}
        onClose={() => {
          if (!create.isPending && !updateDestination.isPending) setPendingPayload(null);
        }}
        title={editingId ? 'Confirm updated details' : 'Confirm withdrawal'}
        footer={
          pendingPayload ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={create.isPending || updateDestination.isPending}
                onClick={() => setPendingPayload(null)}
              >
                Back
              </Button>
              <Button
                type="button"
                loading={create.isPending || updateDestination.isPending}
                onClick={() => {
                  setFormError('');
                  if (editingId) {
                    updateDestination.mutate({
                      id: editingId,
                      payload: {
                        upiDetails: pendingPayload.upiDetails,
                        bankDetails: pendingPayload.bankDetails,
                        usdtDetails: pendingPayload.usdtDetails,
                      },
                    });
                  } else {
                    create.mutate(pendingPayload);
                  }
                }}
              >
                {editingId ? 'Confirm & save' : 'Confirm & submit'}
              </Button>
            </div>
          ) : null
        }
      >
        {pendingPayload && (
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">
              {editingId
                ? 'Verify Name, Bank, Account, IFSC and UPI before saving.'
                : 'Check amount, method and destination before submitting.'}
            </p>
            <dl className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low/50 px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Amount</dt>
                <dd className="font-semibold">{formatCurrency(pendingPayload.amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Method</dt>
                <dd className="font-semibold uppercase">{pendingPayload.method}</dd>
              </div>
              {pendingPayload.method === 'upi' && pendingPayload.upiDetails && (
                <>
                  {pendingPayload.upiDetails.payerName ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-on-surface-variant">NAME</dt>
                      <dd className="text-right font-semibold">
                        {pendingPayload.upiDetails.payerName}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">UPI</dt>
                    <dd className="break-all text-right font-semibold">
                      {pendingPayload.upiDetails.upiId}
                    </dd>
                  </div>
                </>
              )}
              {pendingPayload.method === 'bank' && pendingPayload.bankDetails && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">NAME</dt>
                    <dd className="text-right font-semibold">
                      {pendingPayload.bankDetails.accountHolderName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">ACCOUNT</dt>
                    <dd className="font-mono text-right font-semibold">
                      {pendingPayload.bankDetails.accountNumber}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">IFSC</dt>
                    <dd className="font-mono text-right font-semibold">
                      {pendingPayload.bankDetails.ifscCode}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">BANK</dt>
                    <dd className="text-right font-semibold">
                      {pendingPayload.bankDetails.bankName}
                    </dd>
                  </div>
                </>
              )}
              {pendingPayload.method === 'usdt' && pendingPayload.usdtDetails && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">Wallet</dt>
                    <dd className="break-all text-right font-semibold">
                      {pendingPayload.usdtDetails.walletAddress}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">Network</dt>
                    <dd className="font-semibold">
                      {pendingPayload.usdtDetails.network || 'TRC20'}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {formError && (
              <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {formError}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
