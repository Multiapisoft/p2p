'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withdrawalsApi } from '../api/withdrawals.api';
import { businessApi } from '@/features/business/api/business.api';
import { usersApi } from '@/features/users/api/users.api';
import { getApiErrorMessage, apiGet } from '@/shared/api/client';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Card } from '@/shared/components/ui/Card';
import { formatCurrency } from '@/shared/lib/utils';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  sanitizeAccountNumber,
  upiIdError,
} from '@/shared/lib/validation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { SavedWithdrawalMethodsPanel } from './SavedWithdrawalMethodsPanel';
import type { PaymentMethod, SavedWithdrawalMethod } from '@/shared/types/api.types';

export function canRequestBusinessWithdrawal(user?: {
  staffBusinessId?: string | null;
  permissions?: string[];
} | null) {
  if (!user) return false;
  if (!user.staffBusinessId) return true;
  return user.permissions?.includes('business.manual_withdrawal') ?? false;
}

export function BusinessWithdrawalForm() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const allowed = canRequestBusinessWithdrawal(user);

  const { data: platformSettings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () =>
      apiGet<{ allowMobileNumberUpi?: boolean; minTransactionAmount?: number }>('/platform-settings'),
    enabled: allowed,
  });
  const { data: fx } = useQuery({
    queryKey: ['wallets-exchange-rate'],
    queryFn: () => apiGet<{ usdtInr: number }>('/wallets/exchange-rate'),
    enabled: allowed,
  });
  const [open, setOpen] = useState(true);
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
  const [success, setSuccess] = useState('');
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState('');
  const [saveCurrentMethod, setSaveCurrentMethod] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const { data: overview } = useQuery({
    queryKey: ['business-overview'],
    queryFn: () => businessApi.getOverview(),
    enabled: allowed,
  });

  const { data: savedMethodsData } = useQuery({
    queryKey: ['saved-withdrawal-methods'],
    queryFn: () => usersApi.getWithdrawalMethods(),
    enabled: allowed,
  });

  const saveMethod = useMutation({
    mutationFn: usersApi.saveWithdrawalMethod,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Could not save withdrawal method'));
    },
  });

  const setDefaultMethod = useMutation({
    mutationFn: usersApi.setDefaultWithdrawalMethod,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] }),
  });

  const deleteMethod = useMutation({
    mutationFn: usersApi.deleteWithdrawalMethod,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      setSelectedSavedMethodId('');
    },
  });

  const create = useMutation({
    mutationFn: withdrawalsApi.create,
    onSuccess: (w) => {
      setFormError('');
      setAmount('');
      setUpiId('');
      setPayerName('');
      setAccountNumber('');
      setIfscCode('');
      setAccountHolderName('');
      setBankName('');
      setWalletAddress('');
      setSelectedSavedMethodId('');
      setSaveCurrentMethod(false);
      setSaveAsDefault(false);
      setSuccess(`Request ${w.referenceId} submitted — waiting admin verify`);
      qc.invalidateQueries({ queryKey: ['business-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['business-overview'] });
    },
    onError: (err) => {
      setSuccess('');
      setFormError(getApiErrorMessage(err, 'Could not submit request'));
    },
  });

  useEffect(() => {
    if (searchParams.get('new') === '1') setOpen(true);
  }, [searchParams]);

  const savedMethods = savedMethodsData?.items ?? [];

  useEffect(() => {
    if (!allowed || !open || !savedMethods.length || selectedSavedMethodId) return;
    const preferred = savedMethods.find((m) => m.isDefault) || savedMethods[0];
    if (!preferred) return;
    setSelectedSavedMethodId(preferred._id);
    setMethod(preferred.method);
    setUpiId(preferred.upiDetails?.upiId || '');
    setPayerName(preferred.upiDetails?.payerName || '');
    setAccountNumber(preferred.bankDetails?.accountNumber || '');
    setIfscCode(preferred.bankDetails?.ifscCode || '');
    setAccountHolderName(preferred.bankDetails?.accountHolderName || '');
    setBankName(preferred.bankDetails?.bankName || '');
    setWalletAddress(preferred.usdtDetails?.walletAddress || '');
    setSaveCurrentMethod(false);
    setSaveAsDefault(!!preferred.isDefault);
  }, [allowed, open, savedMethods, selectedSavedMethodId]);

  if (!allowed) return null;

  const remaining = overview?.p2pPayRemaining ?? 0;
  const limit = overview?.p2pPayLimit ?? 0;
  const used = overview?.p2pPayUsed ?? 0;
  const earned = overview?.p2pPayEarned ?? 0;
  const exhausted = remaining < 1;
  const usdtInrRate = fx?.usdtInr || 90;
  const maxAmount =
    method === 'usdt' ? Math.floor((remaining / usdtInrRate) * 1e6) / 1e6 : remaining;
  const minWithdrawal =
    method === 'usdt' ? 1 : Math.max(300, Number(platformSettings?.minTransactionAmount) || 300);

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
    setSaveCurrentMethod(false);
    setSaveAsDefault(!!saved.isDefault);
  };

  const destinationPayload = () => {
    if (method === 'upi') {
      return { upiDetails: { upiId: upiId.trim(), payerName: payerName.trim() } };
    }
    if (method === 'bank') {
      return {
        bankDetails: {
          accountNumber: accountNumber.trim(),
          ifscCode: ifscCode.trim().toUpperCase(),
          accountHolderName: accountHolderName.trim(),
          bankName: bankName.trim(),
        },
      };
    }
    if (method === 'cdm') {
      return { cdmDetails: { payerName: payerName.trim() || accountHolderName.trim() } };
    }
    return { usdtDetails: { walletAddress: walletAddress.trim(), network: 'TRC20' } };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccess('');
    const num = Number(amount);
    if (!num || num < 1) {
      setFormError('Enter a valid amount');
      return;
    }
    if (method !== 'usdt' && num < minWithdrawal) {
      setFormError(`Minimum withdrawal is ₹${minWithdrawal}`);
      return;
    }
    const needInr = method === 'usdt' ? Math.round(num * usdtInrRate * 100) / 100 : num;
    if (needInr > remaining) {
      setFormError(
        remaining < 1
          ? 'No remaining pay limit. User deposits increase remaining; withdrawal must stay within the limit.'
          : `Amount exceeds remaining limit (${formatCurrency(remaining)})`,
      );
      return;
    }

    if (method === 'upi') {
      const upiErr = upiIdError(upiId, true, {
        allowMobileNumber: !!platformSettings?.allowMobileNumberUpi,
      });
      const nameErr = personNameError(payerName, true);
      if (upiErr || nameErr) {
        setFormError(upiErr || nameErr || '');
        return;
      }
    } else if (method === 'bank') {
      const accErr = accountNumberError(accountNumber);
      const ifscErr = ifscError(ifscCode);
      const holderErr = personNameError(accountHolderName);
      const bankErr = bankNameError(bankName);
      const err = accErr || ifscErr || holderErr || bankErr;
      if (err) {
        setFormError(err);
        return;
      }
    } else if (method === 'cdm') {
      const nameErr = personNameError(payerName || accountHolderName, true);
      if (nameErr) {
        setFormError(nameErr);
        return;
      }
    } else if (!walletAddress.trim()) {
      setFormError('Wallet address is required');
      return;
    }

    const dest = destinationPayload();
    try {
      if (saveCurrentMethod) {
        await saveMethod.mutateAsync({
          method,
          isDefault: saveAsDefault,
          ...dest,
        });
      }
      await create.mutateAsync({
        amount: num,
        method,
        ...dest,
      });
    } catch {
      /* onError handlers already set formError */
    }
  };

  return (
    <Card>
      <div id="business-wd-form" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Withdraw from remaining limit</p>
          <p className="text-sm text-on-surface-variant">
            Amount is deducted from your remaining pay limit. User deposits and deposits you
            give users increase it. Admin verifies, then users/investors can pay.
          </p>
        </div>
        <Button type="button" variant={open ? 'outline' : 'secondary'} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide form' : 'New request'}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Remaining
          </p>
          <p className="text-2xl font-bold text-secondary">
            {formatCurrency(remaining)}
          </p>
        </div>
        <p className="text-xs text-on-surface-variant">
          Limit {formatCurrency(limit)}
          {earned > 0 ? ` · Deposits +${formatCurrency(earned)}` : ''}
          {used > 0 ? ` · Used ${formatCurrency(used)}` : ''}
        </p>
      </div>

      {exhausted ? (
        <p className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Remaining limit is ₹0. User deposits increase remaining even when the limit is
          exhausted. Withdrawals cannot be more than remaining.
        </p>
      ) : null}

      <div className="mt-4">
        <SavedWithdrawalMethodsPanel
          onUse={(saved) => {
            applySavedMethod(saved);
            setOpen(true);
          }}
        />
      </div>

      {success ? (
        <p className="mt-3 rounded-lg bg-secondary-container px-3 py-2 text-sm text-on-secondary-container">
          {success}
        </p>
      ) : null}

      {open ? (
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Amount *"
                type="number"
                min={minWithdrawal}
                max={maxAmount}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={exhausted}
              />
            </div>
            {maxAmount >= 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAmount(String(maxAmount))}
              >
                Use remaining
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {(['upi', 'bank', 'usdt', 'cdm'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={exhausted}
                onClick={() => {
                  setMethod(m);
                  setSelectedSavedMethodId('');
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${
                  method === m ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Saved withdrawal method
              <select
                value={selectedSavedMethodId}
                disabled={exhausted}
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
            {selectedSavedMethodId ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setDefaultMethod.mutate(selectedSavedMethodId)}
                >
                  Set default
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMethod.mutate(selectedSavedMethodId)}
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
          {method === 'upi' ? (
            <>
              <Input
                label="UPI ID *"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                required
                disabled={exhausted}
              />
              <Input
                label="Name of Account Holder *"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                required
                disabled={exhausted}
              />
            </>
          ) : null}
          {method === 'bank' ? (
            <>
              <Input
                label="Account number *"
                value={accountNumber}
                onChange={(e) => setAccountNumber(sanitizeAccountNumber(e.target.value))}
                inputMode="numeric"
                maxLength={18}
                required
                disabled={exhausted}
              />
              <Input
                label="IFSC *"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                required
                disabled={exhausted}
              />
              <Input
                label="Name of Account Holder *"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                required
                disabled={exhausted}
              />
              <Input
                label="Bank name *"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                required
                disabled={exhausted}
              />
            </>
          ) : null}
          {method === 'usdt' ? (
            <Input
              label="USDT wallet *"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              required
              disabled={exhausted}
            />
          ) : null}
          {method === 'cdm' ? (
            <Input
              label="Name of Account Holder *"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              required
              disabled={exhausted}
            />
          ) : null}
          {!selectedSavedMethodId ? (
          <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={saveCurrentMethod}
                onChange={(e) => setSaveCurrentMethod(e.target.checked)}
                disabled={exhausted}
              />
              <span>Save this withdrawal method</span>
            </label>
            {saveCurrentMethod ? (
              <label className="flex items-center gap-2 text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(e) => setSaveAsDefault(e.target.checked)}
                  disabled={exhausted}
                />
                <span>Make it default</span>
              </label>
            ) : null}
          </div>
          ) : null}
          {formError ? (
            <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
              {formError}
            </div>
          ) : null}
          <Button
            type="submit"
            loading={create.isPending || saveMethod.isPending}
            disabled={exhausted}
          >
            Submit withdrawal request
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
