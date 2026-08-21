'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withdrawalsApi } from '@/features/withdrawals/api/withdrawals.api';
import { platformSettingsApi } from '@/features/settings/api/platform-settings.api';
import { usersApi } from '@/features/users/api/users.api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  sanitizeAccountNumber,
  upiIdError,
} from '@/shared/lib/validation';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { SavedWithdrawalMethodsPanel } from './SavedWithdrawalMethodsPanel';
import type { PaymentMethod, SavedWithdrawalMethod } from '@/shared/types/api.types';

/** Platform commission withdraw supports payout rails only (not CDM). */
type Method = Exclude<PaymentMethod, 'cdm'>;

export function PlatformCommissionWithdrawForm({
  available,
}: {
  available: number;
}) {
  const { has } = usePermissions();
  const qc = useQueryClient();
  const canWithdraw = has(PERMISSIONS.WITHDRAWALS);

  const { data: settings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => platformSettingsApi.get(),
    enabled: canWithdraw,
  });

  const { data: savedMethodsData } = useQuery({
    queryKey: ['saved-withdrawal-methods'],
    queryFn: () => usersApi.getWithdrawalMethods(),
    enabled: canWithdraw,
  });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('upi');
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

  const savedMethods = savedMethodsData?.items ?? [];

  const applySavedMethod = (saved: SavedWithdrawalMethod) => {
    if (saved.method === 'cdm') return;
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

  useEffect(() => {
    if (!open || !savedMethods.length || selectedSavedMethodId) return;
    const preferred =
      savedMethods.find((m) => m.isDefault && m.method !== 'cdm') ||
      savedMethods.find((m) => m.method !== 'cdm');
    if (preferred) applySavedMethod(preferred);
  }, [open, savedMethods, selectedSavedMethodId]);

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
    mutationFn: withdrawalsApi.createPlatformCommission,
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
      setOpen(false);
      setSuccess(`Request ${w.referenceId} listed for P2P pay`);
      qc.invalidateQueries({ queryKey: ['platform-wallet'] });
    },
    onError: (err) => {
      setSuccess('');
      setFormError(getApiErrorMessage(err, 'Could not submit withdrawal'));
    },
  });

  if (!canWithdraw) return null;

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
    return { usdtDetails: { walletAddress: walletAddress.trim(), network: 'TRC20' } };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccess('');
    const num = Number(amount);
    const minWithdrawal =
      method === 'usdt' ? 1 : Math.max(300, Number(settings?.minTransactionAmount) || 300);
    if (!Number.isFinite(num) || num < 1) {
      setFormError('Enter a valid amount');
      return;
    }
    if (method !== 'usdt' && num < minWithdrawal) {
      setFormError(`Minimum withdrawal is ₹${minWithdrawal}`);
      return;
    }
    if (num > available) {
      setFormError(`Amount exceeds available ₹${available}`);
      return;
    }

    if (method === 'upi') {
      const upiErr = upiIdError(upiId, true, {
        allowMobileNumber: !!settings?.allowMobileNumberUpi,
      });
      const nameErr = personNameError(payerName, true);
      if (upiErr || nameErr) {
        setFormError(upiErr || nameErr || '');
        return;
      }
    } else if (method === 'bank') {
      const err =
        accountNumberError(accountNumber) ||
        ifscError(ifscCode) ||
        personNameError(accountHolderName) ||
        bankNameError(bankName);
      if (err) {
        setFormError(err);
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
    <div className="border-t border-outline-variant pt-3">
      <div className="mb-4">
        <SavedWithdrawalMethodsPanel
          onUse={(saved) => {
            applySavedMethod(saved);
            setOpen(true);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Withdraw commission</p>
        <Button
          type="button"
          size="sm"
          variant={open ? 'outline' : 'secondary'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'New request'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-on-surface-variant">
        Listed immediately for users/investors to pay. You can also pay it from Withdrawals.
      </p>
      {success ? (
        <p className="mt-2 rounded-lg bg-secondary-container px-3 py-2 text-sm text-on-secondary-container">
          {success}
        </p>
      ) : null}
      {open ? (
        <form className="mt-3 space-y-3" onSubmit={submit}>
          <Input
            label="Amount *"
            type="number"
            min={method === 'usdt' ? 1 : Math.max(300, Number(settings?.minTransactionAmount) || 300)}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <div className="flex flex-wrap gap-2">
            {(['upi', 'bank', 'usdt'] as const).map((m) => (
              <button
                key={m}
                type="button"
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
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSavedMethodId(id);
                  const picked = savedMethods.find((item) => item._id === id);
                  if (picked) applySavedMethod(picked);
                }}
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-normal"
              >
                <option value="">
                  {savedMethods.length ? 'Choose saved method' : 'No saved methods yet'}
                </option>
                {savedMethods.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.label}
                    {item.isDefault ? ' (Default)' : ''}
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
              <Input label="UPI ID *" value={upiId} onChange={(e) => setUpiId(e.target.value)} required />
              <Input
                label="Name of Account Holder *"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                required
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
          ) : null}
          {method === 'usdt' ? (
            <Input
              label="USDT wallet *"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              required
            />
          ) : null}
          {!selectedSavedMethodId ? (
          <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={saveCurrentMethod}
                onChange={(e) => setSaveCurrentMethod(e.target.checked)}
              />
              <span>Save this withdrawal method</span>
            </label>
            {saveCurrentMethod ? (
              <label className="flex items-center gap-2 text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(e) => setSaveAsDefault(e.target.checked)}
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
            disabled={available < 1}
          >
            Submit request
          </Button>
        </form>
      ) : null}
    </div>
  );
}
