'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withdrawalsApi } from '../api/withdrawals.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { profileApi } from '@/features/profile/api/profile.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Modal } from '@/shared/components/ui/Modal';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import { apiGet } from '@/shared/api/client';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  sanitizeAccountNumber,
  upiIdError,
} from '@/shared/lib/validation';
import { formatSecondsMmSs } from '@/shared/lib/upi-qr';
import { SavedWithdrawalMethodsPanel } from '../components/SavedWithdrawalMethodsPanel';
import type {
  CreateWithdrawalPayload,
  PaymentMethod,
  SavedWithdrawalMethod,
  Withdrawal,
} from '@/shared/types/api.types';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'usdt', label: 'USDT' },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
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
  const [status, setStatus] = useState('all');
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
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState('');
  const [saveCurrentMethod, setSaveCurrentMethod] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: platformSettings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () =>
      apiGet<{
        allowMobileNumberUpi?: boolean;
        minTransactionAmount?: number;
        investorAllowedWithdrawalMethods?: PaymentMethod[];
      }>('/platform-settings'),
  });

  const enabledMethods = useMemo(() => {
    const allowed = platformSettings?.investorAllowedWithdrawalMethods;
    if (allowed?.length) return METHODS.filter((m) => allowed.includes(m.value));
    return METHODS;
  }, [platformSettings?.investorAllowedWithdrawalMethods]);

  useEffect(() => {
    if (!enabledMethods.length) return;
    if (!enabledMethods.some((m) => m.value === method)) {
      setMethod(enabledMethods[0].value);
    }
  }, [enabledMethods, method]);

  const { data: balance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance(),
  });

  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: () => profileApi.getMe(),
  });

  const { data: savedMethodsData } = useQuery({
    queryKey: ['saved-withdrawal-methods'],
    queryFn: () => profileApi.getWithdrawalMethods(),
  });

  const listQuery = useMemo(
    () => ({ page, limit, sort: 'newest', status }),
    [page, limit, status],
  );

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
    setSelectedSavedMethodId('');
    setSaveCurrentMethod(false);
    setSaveAsDefault(false);
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
    setSelectedSavedMethodId('');
  };

  const saveMethod = useMutation({
    mutationFn: (payload: Parameters<typeof profileApi.saveWithdrawalMethod>[0]) =>
      profileApi.saveWithdrawalMethod(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
    },
    onError: (err: unknown) => setFormError(apiErrorMessage(err, 'Save method failed')),
  });

  const setDefaultMethod = useMutation({
    mutationFn: (methodId: string) => profileApi.setDefaultWithdrawalMethod(methodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
    },
  });

  const deleteMethod = useMutation({
    mutationFn: (methodId: string) => profileApi.deleteWithdrawalMethod(methodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      setSelectedSavedMethodId('');
    },
  });

  const savedMethods = (savedMethodsData?.items ?? profile?.savedWithdrawalMethods ?? []).filter(
    (m) => enabledMethods.some((em) => em.value === m.method),
  );
  const applySavedMethod = (saved: SavedWithdrawalMethod) => {
    setSelectedSavedMethodId(saved._id);
    setMethod(saved.method);
    setUpiId(saved.upiDetails?.upiId || '');
    setPayerName(saved.upiDetails?.payerName || '');
    setAccountNumber(saved.bankDetails?.accountNumber || '');
    setIfscCode(saved.bankDetails?.ifscCode || '');
    setAccountHolderName(saved.bankDetails?.accountHolderName || '');
    setBankName(saved.bankDetails?.bankName || '');
    setWalletAddress(saved.usdtDetails?.walletAddress || '');
    setNetwork(saved.usdtDetails?.network || 'TRC20');
    setSaveCurrentMethod(false);
    setSaveAsDefault(!!saved.isDefault);
  };

  useEffect(() => {
    if (!showForm || editingId || !savedMethods.length) return;
    if (selectedSavedMethodId) return;
    const preferred = savedMethods.find((m) => m.isDefault) || savedMethods[0];
    if (preferred) applySavedMethod(preferred);
  }, [showForm, editingId, savedMethods, selectedSavedMethodId]);

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
  const minWithdrawal =
    method === 'usdt' ? 1 : Math.max(300, Number(platformSettings?.minTransactionAmount) || 300);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const num = Number(amount);
    if (!num || num < 1) {
      setFormError('Enter a valid amount');
      return;
    }
    if (method !== 'usdt' && num < minWithdrawal) {
      setFormError(`Minimum withdrawal is ₹${minWithdrawal}`);
      return;
    }
    if (num > available && !editingId) {
      setFormError(`Insufficient balance (${formatCurrency(available)})`);
      return;
    }

    const payload: CreateWithdrawalPayload = { amount: num, method };
    if (method === 'upi') {
      const upiErr = upiIdError(upiId, true, {
        allowMobileNumber: !!platformSettings?.allowMobileNumberUpi,
      });
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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-low/40 to-secondary-container/20 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-secondary/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
              <span className="material-symbols-outlined text-sm">north_east</span>
              Withdrawals
            </p>
            <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold">
              My withdrawal requests
            </h1>
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
      </div>

      <div className="rounded-xl border border-secondary/25 bg-secondary-container/15 p-4">
        <p className="text-xs text-on-surface-variant">Available balance</p>
        <p className="text-2xl font-bold text-secondary">{formatCurrency(available)}</p>
      </div>

      <SavedWithdrawalMethodsPanel
        onUse={(saved) => {
          setEditingId(null);
          setPendingPayload(null);
          setFormError('');
          applySavedMethod(saved);
          setShowForm(true);
        }}
      />

      {showForm && (
        <Card>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <p className="mb-2 text-sm font-semibold">Payout method</p>
              <div className="flex flex-wrap gap-2">
                {enabledMethods.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      if (!editingId) {
                        setMethod(m.value);
                        setSelectedSavedMethodId('');
                      }
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

            {!editingId && (
              <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Saved withdrawal method
                  <select
                    value={selectedSavedMethodId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedSavedMethodId(id);
                      const picked = savedMethods.find((m) => m._id === id);
                      if (picked) applySavedMethod(picked);
                    }}
                    className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-normal"
                  >
                    <option value="">
                      {savedMethods.length ? 'Choose saved method' : 'No saved methods yet'}
                    </option>
                    {savedMethods.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.label}
                        {m.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {savedMethods.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">
                    Add Bank, UPI or USDT in Payout methods above, then select it here.
                  </p>
                ) : null}
                {selectedSavedMethodId && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDefaultMethod.mutate(selectedSavedMethodId)}
                    >
                      Set default
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => deleteMethod.mutate(selectedSavedMethodId)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Input
              label={method === 'usdt' ? 'Amount (INR → USDT open)' : 'Amount (INR)'}
              type="number"
              min={minWithdrawal}
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
                  label="Name of Account Holder *"
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
                  onChange={(e) => setAccountNumber(sanitizeAccountNumber(e.target.value))}
                  inputMode="numeric"
                  maxLength={18}
                  required
                />
                <Input
                  label="IFSC *"
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  required
                />
                <Input
                  label="Name of Account Holder *"
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

            {!editingId && !selectedSavedMethodId && (
              <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={saveCurrentMethod}
                    onChange={(e) => setSaveCurrentMethod(e.target.checked)}
                  />
                  <span>Save this withdrawal method</span>
                </label>
                {saveCurrentMethod && (
                  <label className="flex items-center gap-2 text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={saveAsDefault}
                      onChange={(e) => setSaveAsDefault(e.target.checked)}
                    />
                    <span>Make it default</span>
                  </label>
                )}
              </div>
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
        <div className="mb-3 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                setStatus(s.value);
                setPage(1);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                status === s.value
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState
            message={
              status !== 'all'
                ? `No ${status} withdrawals`
                : 'No withdrawals yet'
            }
            icon="north_east"
          />
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
              <article
                key={w._id}
                className={`overflow-hidden rounded-2xl border border-outline-variant/80 border-l-4 bg-surface-container-lowest p-3 shadow-sm sm:p-4 ${
                  w.status === 'pending'
                    ? 'border-l-amber-500'
                    : w.status === 'processing'
                      ? 'border-l-sky-500'
                      : w.status === 'completed'
                        ? 'border-l-emerald-500'
                        : w.status === 'cancelled' || w.status === 'rejected'
                          ? 'border-l-red-500'
                          : 'border-l-outline-variant'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <span className="material-symbols-outlined text-[18px]">
                          {w.method === 'upi'
                            ? 'qr_code_2'
                            : w.method === 'bank'
                              ? 'account_balance'
                              : 'currency_bitcoin'}
                        </span>
                      </span>
                      <p className="text-lg font-bold tabular-nums text-error">
                        {formatCurrency(w.amount, w.currency)}
                        {w.sourceAmount != null && w.currency === 'USDT' ? (
                          <span className="ml-1 text-xs font-normal text-on-surface-variant">
                            (locked {formatCurrency(w.sourceAmount, 'INR')})
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <p className="mt-1 font-mono text-[11px] font-semibold text-primary">
                      {w.referenceId}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {w.method.toUpperCase()} · {formatDate(w.createdAt)}
                    </p>
                    {w.p2pListStatus === 'listed' &&
                    (w.status === 'pending' || w.status === 'processing') ? (
                      <p className="mt-1 text-[11px] font-medium text-secondary">
                        Approved — verified for payout
                      </p>
                    ) : null}
                    <DestinationLine w={w} />
                    {(w.status === 'pending' || w.status === 'processing') && canCancel && tatLeft > 0 && (
                      <p className="mt-1 text-[11px] font-medium text-secondary">
                        You can edit or cancel for {formatSecondsMmSs(tatLeft)}
                      </p>
                    )}
                    {(w.status === 'pending' || w.status === 'processing') && !canCancel && (
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        {w.p2pListStatus === 'listed'
                          ? 'Once approved (verified for payout), you cannot cancel. Contact business/admin.'
                          : 'Edit/cancel window is over. Business or admin can cancel if needed.'}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={w.status} />
                    {canCancel && tatLeft > 0 && (
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
              </article>
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
                loading={
                  create.isPending ||
                  updateDestination.isPending ||
                  saveMethod.isPending ||
                  setDefaultMethod.isPending ||
                  deleteMethod.isPending
                }
                onClick={async () => {
                  if (
                    pendingPayload.method === 'upi' &&
                    !pendingPayload.upiDetails?.payerName?.trim()
                  ) {
                    setFormError('Account name is required');
                    return;
                  }
                  setFormError('');
                  if (editingId) {
                    await updateDestination.mutateAsync({
                      id: editingId,
                      payload: {
                        upiDetails: pendingPayload.upiDetails,
                        bankDetails: pendingPayload.bankDetails,
                        usdtDetails: pendingPayload.usdtDetails,
                      },
                    });
                  } else {
                    if (saveCurrentMethod && pendingPayload.method !== 'cdm') {
                      await saveMethod.mutateAsync({
                        method: pendingPayload.method,
                        isDefault: saveAsDefault,
                        upiDetails: pendingPayload.upiDetails,
                        bankDetails: pendingPayload.bankDetails,
                        usdtDetails: pendingPayload.usdtDetails,
                      });
                    }
                    await create.mutateAsync(pendingPayload);
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
              {editingId ? 'Verify details before saving.' : 'Check details before submitting.'}
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
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">NAME</dt>
                    <dd className="text-right font-semibold">
                      {pendingPayload.upiDetails.payerName || '—'}
                    </dd>
                  </div>
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
