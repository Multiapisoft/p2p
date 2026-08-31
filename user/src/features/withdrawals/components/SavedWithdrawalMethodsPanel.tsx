'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '@/features/profile/api/profile.api';
import { apiGet } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { toast } from '@/shared/ui/toast/toast.store';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  sanitizeAccountNumber,
  upiIdError,
} from '@/shared/lib/validation';
import type { PaymentMethod, SavedWithdrawalMethod } from '@/shared/types/api.types';

const ADD_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
];

function methodErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const msg = (error as { response?: { data?: { message?: string | string[] } } }).response?.data
      ?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) return msg.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not save method';
}

function methodSummary(m: SavedWithdrawalMethod) {
  if (m.method === 'upi') return m.upiDetails?.upiId || m.label;
  if (m.method === 'bank') {
    const acct = m.bankDetails?.accountNumber || '';
    const last4 = acct.slice(-4) || '----';
    return `XXXX${last4}${m.bankDetails?.ifscCode ? ` · ${m.bankDetails.ifscCode}` : ''}`;
  }
  const addr = m.usdtDetails?.walletAddress || '';
  const short = addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
  return `${m.usdtDetails?.network || 'TRC20'} · ${short}`;
}

export function SavedWithdrawalMethodsPanel({
  onUse,
}: {
  onUse?: (method: SavedWithdrawalMethod) => void;
}) {
  const qc = useQueryClient();
  const [addMethod, setAddMethod] = useState<PaymentMethod | null>(null);
  const [upiId, setUpiId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [formError, setFormError] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: () => profileApi.getMe(),
  });

  const { data: platformSettings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => apiGet<{ allowMobileNumberUpi?: boolean }>('/platform-settings'),
  });

  const enabledAddMethods = useMemo(() => {
    const allowed = profile?.referredBusiness?.allowedWithdrawalMethods;
    if (allowed?.length) return ADD_METHODS.filter((m) => allowed.includes(m.value));
    return ADD_METHODS;
  }, [profile?.referredBusiness?.allowedWithdrawalMethods]);

  const { data } = useQuery({
    queryKey: ['saved-withdrawal-methods'],
    queryFn: () => profileApi.getWithdrawalMethods(),
  });

  const items = data?.items ?? [];

  const resetAddForm = () => {
    setUpiId('');
    setPayerName('');
    setAccountNumber('');
    setIfscCode('');
    setAccountHolderName('');
    setBankName('');
    setWalletAddress('');
    setSaveAsDefault(true);
    setFormError('');
  };

  const closeAdd = () => {
    setAddMethod(null);
    resetAddForm();
  };

  const saveMethod = useMutation({
    mutationFn: profileApi.saveWithdrawalMethod,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success('Payout method saved');
      closeAdd();
    },
    onError: (err) => {
      const msg = methodErrorMessage(err);
      setFormError(msg);
      toast.error('Save failed', msg);
    },
  });

  const setDefaultMethod = useMutation({
    mutationFn: profileApi.setDefaultWithdrawalMethod,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success('Default method updated');
    },
    onError: (err) => toast.error('Default update failed', methodErrorMessage(err)),
  });

  const deleteMethod = useMutation({
    mutationFn: profileApi.deleteWithdrawalMethod,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success('Saved method deleted');
    },
    onError: (err) => toast.error('Delete failed', methodErrorMessage(err)),
  });

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMethod) return;
    setFormError('');
    if (addMethod === 'upi') {
      const err =
        upiIdError(upiId, true, {
          allowMobileNumber: !!platformSettings?.allowMobileNumberUpi,
        }) || personNameError(payerName, true);
      if (err) {
        setFormError(err);
        return;
      }
      saveMethod.mutate({
        method: 'upi',
        isDefault: saveAsDefault,
        upiDetails: { upiId: upiId.trim(), payerName: payerName.trim() },
      });
      return;
    }
    if (addMethod === 'bank') {
      const err =
        accountNumberError(accountNumber) ||
        ifscError(ifscCode) ||
        personNameError(accountHolderName) ||
        bankNameError(bankName);
      if (err) {
        setFormError(err);
        return;
      }
      saveMethod.mutate({
        method: 'bank',
        isDefault: saveAsDefault,
        bankDetails: {
          accountNumber: accountNumber.trim(),
          ifscCode: ifscCode.trim().toUpperCase(),
          accountHolderName: accountHolderName.trim(),
          bankName: bankName.trim(),
        },
      });
      return;
    }
    if (!walletAddress.trim()) {
      setFormError('Wallet address is required');
      return;
    }
    saveMethod.mutate({
      method: 'usdt',
      isDefault: saveAsDefault,
      usdtDetails: { walletAddress: walletAddress.trim(), network: 'TRC20' },
    });
  };

  return (
    <>
      <Card title="Payout methods">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {enabledAddMethods.map((m) => (
            <Button
              key={m.value}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                resetAddForm();
                setAddMethod(m.value);
              }}
            >
              + {m.label}
            </Button>
          ))}
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant px-3 py-4 text-center text-sm text-on-surface-variant">
            No saved methods.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((m) => (
              <li
                key={m._id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {m.method.toUpperCase()}
                    {m.isDefault ? (
                      <span className="ml-2 rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
                        Default
                      </span>
                    ) : null}
                  </p>
                  <p className="break-all text-xs text-on-surface-variant">{methodSummary(m)}</p>
                  {m.method === 'upi' && m.upiDetails?.payerName ? (
                    <p className="text-xs text-on-surface-variant">{m.upiDetails.payerName}</p>
                  ) : null}
                  {m.method === 'bank' && m.bankDetails?.accountHolderName ? (
                    <p className="text-xs text-on-surface-variant">
                      {m.bankDetails.accountHolderName}
                      {m.bankDetails.bankName ? ` · ${m.bankDetails.bankName}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {onUse ? (
                    <Button type="button" size="sm" onClick={() => onUse(m)}>
                      Use
                    </Button>
                  ) : null}
                  {!m.isDefault ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setDefaultMethod.mutate(m._id)}
                      disabled={setDefaultMethod.isPending}
                    >
                      Default
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMethod.mutate(m._id)}
                    disabled={deleteMethod.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!addMethod}
        onClose={() => {
          if (!saveMethod.isPending) closeAdd();
        }}
        title={`Add ${addMethod === 'upi' ? 'UPI' : addMethod === 'bank' ? 'Bank' : 'USDT'} method`}
      >
        <form className="space-y-3" onSubmit={submitAdd}>
          {addMethod === 'upi' ? (
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
          ) : null}
          {addMethod === 'bank' ? (
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
          {addMethod === 'usdt' ? (
            <Input
              label="USDT wallet address *"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              required
            />
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
            />
            <span>Make it default</span>
          </label>
          {formError ? (
            <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
              {formError}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeAdd} disabled={saveMethod.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={saveMethod.isPending}>
              Save method
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
