'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { withdrawalsApi } from '../api/withdrawals.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { profileApi } from '@/features/profile/api/profile.api';
import { apiGet } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate, cn } from '@/shared/lib/utils';
import {
  accountNumberError,
  bankNameError,
  ifscError,
  personNameError,
  sanitizeAccountNumber,
  upiIdError,
} from '@/shared/lib/validation';
import { formatSecondsMmSs } from '@/shared/lib/upi-qr';
import { Modal } from '@/shared/components/ui/Modal';
import { toast } from '@/shared/ui/toast/toast.store';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import { confirmDialog } from '@/shared/ui/confirm/confirm.store';
import { SavedWithdrawalMethodsPanel } from '../components/SavedWithdrawalMethodsPanel';
import type {
  CreateWithdrawalPayload,
  PaymentMethod,
  SavedWithdrawalMethod,
  TransactionStatus,
  Withdrawal,
  WithdrawalSplitPayment,
} from '@/shared/types/api.types';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
  { value: 'cdm', label: 'CDM' },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

function withdrawalErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) return msg.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Withdrawal failed. Check balance and details.';
}

function progressPct(paid: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((paid / total) * 100));
}

function paymentCanAct(p: WithdrawalSplitPayment) {
  if (p.status !== 'pending' || p.disputedAt) {
    return { received: false, dispute: false, endsAt: undefined as number | undefined };
  }
  const end = p.autoApproveAt
    ? new Date(p.autoApproveAt).getTime()
    : p.createdAt
      ? new Date(p.createdAt).getTime() + 24 * 60 * 60 * 1000
      : 0;
  const within = end > Date.now();
  return {
    received: true,
    dispute: within,
    endsAt: end || undefined,
  };
}

function formatWindowLeft(endsAt?: number) {
  if (!endsAt) return null;
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'Auto-receive due';
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${h}h ${m}m left to dispute`;
}

function DestinationLine({ w }: { w: Withdrawal }) {
  if (w.method === 'upi' && w.upiDetails?.upiId) {
    const name = w.upiDetails.payerName?.trim();
    return (
      <p className="text-xs text-on-surface-variant">
        {name ? `NAME ${name} · ` : ''}UPI {w.upiDetails.upiId}
      </p>
    );
  }
  if (w.method === 'bank') {
    const accountNumber = w.bankDetails?.accountNumber;
    if (!accountNumber) return null;
    const b = w.bankDetails;
    const parts = [
      b?.accountHolderName ? `NAME ${b.accountHolderName}` : null,
      `A/C ****${accountNumber.slice(-4)}`,
      b?.ifscCode ? `IFSC ${b.ifscCode}` : null,
      b?.bankName ? `BANK ${b.bankName}` : null,
    ].filter(Boolean);
    return <p className="text-xs text-on-surface-variant">{parts.join(' · ')}</p>;
  }
  if (w.method === 'usdt' && w.usdtDetails?.walletAddress) {
    const addr = w.usdtDetails.walletAddress;
    return (
      <p className="break-all text-xs text-on-surface-variant">
        USDT · {addr.slice(0, 10)}…{addr.slice(-6)}
      </p>
    );
  }
  return null;
}

export function WithdrawalsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
  const [actionError, setActionError] = useState('');
  const [disputeFor, setDisputeFor] = useState<WithdrawalSplitPayment | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: balance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance(),
  });

  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: () => profileApi.getMe(),
  });
  const { data: platformSettings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () =>
      apiGet<{ allowMobileNumberUpi?: boolean; minTransactionAmount?: number }>('/platform-settings'),
  });
  /** Business-code users are capped by remaining pay limit (deposits increase it). */
  const isBusinessLinked = Boolean(profile?.referredByBusiness);
  const { data: savedMethodsData } = useQuery({
    queryKey: ['saved-withdrawal-methods'],
    queryFn: () => profileApi.getWithdrawalMethods(),
  });

  const listQuery = useMemo(
    () => ({ page, limit, status, search, sort, method: methodFilter }),
    [page, limit, status, search, sort, methodFilter],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['withdrawals', listQuery],
    queryFn: () => withdrawalsApi.getMy(listQuery),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!data?.items?.length) return;
    setExpandedId((prev) => {
      if (prev && data.items.some((w) => w._id === prev)) return prev;
      const withPays = data.items.find((w) => (w.payments?.length ?? 0) > 0);
      return withPays?._id ?? data.items[0]?._id ?? null;
    });
  }, [data]);

  useEffect(() => {
    if (!disputeFor || !data?.items) return;
    const stillPending = data.items.some((w) =>
      w.payments?.some((p) => p._id === disputeFor._id && p.status === 'pending' && !p.disputedAt),
    );
    if (!stillPending) {
      setDisputeFor(null);
      setDisputeReason('');
    }
  }, [data, disputeFor]);

  const create = useMutation({
    mutationFn: (payload: CreateWithdrawalPayload) => withdrawalsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      setPendingPayload(null);
      setShowForm(false);
      resetForm();
      toast.success(
        'Withdrawal submitted',
        'Waiting for business approval. After it is approved (verified), others can pay this request.',
      );
    },
    onError: (err) => {
      const msg = withdrawalErrorMessage(err);
      setFormError(msg);
      toast.error('Withdrawal failed', msg);
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => withdrawalsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      toast.success('Withdrawal cancelled');
    },
    onError: (err) => toast.error('Cancel failed', withdrawalErrorMessage(err)),
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
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setPendingPayload(null);
      setShowForm(false);
      resetForm();
      toast.success('Withdrawal details updated');
    },
    onError: (err) => {
      const msg = withdrawalErrorMessage(err);
      setFormError(msg);
      toast.error('Update failed', msg);
    },
  });

  const saveMethod = useMutation({
    mutationFn: (payload: Parameters<typeof profileApi.saveWithdrawalMethod>[0]) =>
      profileApi.saveWithdrawalMethod(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success('Withdrawal method saved');
    },
    onError: (err) => {
      toast.error('Save method failed', withdrawalErrorMessage(err));
    },
  });

  const setDefaultMethod = useMutation({
    mutationFn: (methodId: string) => profileApi.setDefaultWithdrawalMethod(methodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      toast.success('Default method updated');
    },
    onError: (err) => toast.error('Default update failed', withdrawalErrorMessage(err)),
  });

  const deleteMethod = useMutation({
    mutationFn: (methodId: string) => profileApi.deleteWithdrawalMethod(methodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-withdrawal-methods'] });
      qc.invalidateQueries({ queryKey: ['profile-me'] });
      setSelectedSavedMethodId('');
      toast.success('Saved method deleted');
    },
    onError: (err) => toast.error('Delete failed', withdrawalErrorMessage(err)),
  });

  const confirmReceived = useMutation({
    mutationFn: (paymentId: string) => withdrawalsApi.confirmPaymentReceived(paymentId),
    onSuccess: async () => {
      setActionError('');
      await qc.refetchQueries({ queryKey: ['withdrawals'] });
      await qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      toast.success('Payment confirmed', 'Amount unlocked for the payer.');
    },
    onError: async (err) => {
      const msg = withdrawalErrorMessage(err);
      setActionError(msg);
      toast.error('Confirm failed', msg);
      await qc.refetchQueries({ queryKey: ['withdrawals'] });
    },
  });

  const raiseDispute = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason?: string }) =>
      withdrawalsApi.disputePayment(paymentId, reason),
    onSuccess: async () => {
      setActionError('');
      setDisputeFor(null);
      setDisputeReason('');
      await qc.refetchQueries({ queryKey: ['withdrawals'] });
      toast.success('Dispute raised', 'A support ticket was created.');
    },
    onError: async (err) => {
      const msg = withdrawalErrorMessage(err);
      setActionError(msg);
      toast.error('Dispute failed', msg);
      await qc.refetchQueries({ queryKey: ['withdrawals'] });
    },
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
    setAmount(String(w.amount));
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

  const savedMethods = savedMethodsData?.items ?? profile?.savedWithdrawalMethods ?? [];
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

  const displayCurrency = balance?.currency || 'INR';
  const walletIsUsdt = (displayCurrency || '').toUpperCase() === 'USDT';
  const usdtInrRate = balance?.usdtInrRate ?? 90;
  /** UPI/Bank: enter INR to receive; USDT method or INR wallet: enter wallet currency */
  const amountIsInrPayout = walletIsUsdt && method !== 'usdt';
  const payRemaining = balance?.p2pPayRemainingInr;
  const remainingUsdtMax =
    typeof payRemaining === 'number'
      ? Math.floor((payRemaining / usdtInrRate) * 1e6) / 1e6
      : undefined;
  const maxInr =
    balance?.approxInrAvailable ??
    (walletIsUsdt ? Math.floor((balance?.availableBalance ?? 0) * usdtInrRate * 100) / 100 : undefined);
  const amountMax = isBusinessLinked
    ? method === 'usdt'
      ? remainingUsdtMax
      : payRemaining
    : amountIsInrPayout
      ? maxInr
      : balance?.availableBalance;
  const usdtToSpend =
    amountIsInrPayout && Number(amount) > 0
      ? Math.ceil((Number(amount) / usdtInrRate) * 1e6) / 1e6
      : 0;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const minWithdrawal =
    method === 'usdt' ? 1 : Math.max(300, Number(platformSettings?.minTransactionAmount) || 300);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 1) {
      setFormError('Enter a valid amount');
      return;
    }
    if (method !== 'usdt' && numAmount < minWithdrawal) {
      setFormError(`Minimum withdrawal is ₹${minWithdrawal}`);
      return;
    }
    if (isBusinessLinked && typeof payRemaining === 'number') {
      const needInr = method === 'usdt' ? Math.round(numAmount * usdtInrRate * 100) / 100 : numAmount;
      if (needInr > payRemaining) {
        setFormError(
          payRemaining < 1
            ? 'No remaining pay limit. Deposit first — deposits increase the limit. Withdrawal must stay within remaining.'
            : `Amount exceeds remaining pay limit (₹${payRemaining})`,
        );
        return;
      }
    }
    if (balance && !isBusinessLinked && !editingId) {
      if (amountIsInrPayout) {
        const needUsdt = Math.ceil((numAmount / usdtInrRate) * 1e6) / 1e6;
        if (needUsdt > balance.availableBalance) {
          setFormError(
            `Insufficient USDT. Need ~${needUsdt} USDT for ₹${numAmount} at ${usdtInrRate} INR/USDT`,
          );
          return;
        }
      } else if (numAmount > balance.availableBalance) {
        setFormError('Insufficient balance');
        return;
      }
    }

    const payload: CreateWithdrawalPayload = { amount: numAmount, method };

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
    } else if (method === 'cdm') {
      const nameErr = personNameError(payerName, true);
      if (nameErr) {
        setFormError(nameErr);
        return;
      }
      payload.cdmDetails = { payerName: payerName.trim() };
    } else {
      if (!walletAddress) {
        setFormError('Wallet address is required');
        return;
      }
      payload.usdtDetails = { walletAddress, network };
    }

    setPendingPayload(payload);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-surface-container-lowest via-surface-container-low/50 to-secondary-container/20 p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-secondary/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-secondary">
            <span className="material-symbols-outlined text-sm">north_east</span>
            Withdrawals
          </p>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
            Withdrawal requests
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Request payouts and track incoming payments.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <CsvDownloadButton<Withdrawal>
            title="My withdrawals"
            filename="withdrawals"
            filters={{ Status: status, Method: methodFilter, Search: search, Sort: sort }}
            disabled={!data?.total}
            columns={[
              { header: 'Reference', value: (w) => w.referenceId },
              { header: 'Status', value: (w) => w.status },
              { header: 'Method', value: (w) => w.method },
              { header: 'Amount', value: (w) => w.amount },
              { header: 'Paid', value: (w) => w.paidAmount ?? 0 },
              { header: 'Created', value: (w) => w.createdAt },
            ]}
            fetchRows={() =>
              fetchAllPages((page, limit) => withdrawalsApi.getMy({ ...listQuery, page, limit }))
            }
          />
          <Button
          className="w-full sm:w-auto"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              setShowForm(true);
              setFormError('');
            }
          }}
        >
          {showForm ? 'Close form' : 'New withdrawal'}
        </Button>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Balance
          </p>
          <p className="mt-1 text-sm font-bold leading-tight sm:mt-2 sm:text-2xl">
            {formatCurrency(balance?.availableBalance ?? 0, displayCurrency)}
          </p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">
            {balance?.source === 'partner' ? 'Partner wallet' : 'FairPlay wallet'}
          </p>
          {walletIsUsdt && (
            <p className="mt-1 text-[10px] leading-snug text-on-surface-variant sm:mt-2 sm:text-xs">
              Rate {usdtInrRate}
              {typeof maxInr === 'number' ? ` · ~${formatCurrency(maxInr, 'INR')}` : ''}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Open
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">
            {items.filter((w) => w.status === 'pending' || w.status === 'processing').length}
          </p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">On this page</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Total
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{total}</p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">Matching filters</p>
        </div>
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
        <Card title={editingId ? 'Edit withdrawal details' : 'Request withdrawal'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="chip-scroll">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    if (editingId) return;
                    setMethod(m.value);
                    setSelectedSavedMethodId('');
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm ${
                    method === m.value
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                  }`}
                >
                  {m.label}
                </button>
              ))}
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

            {walletIsUsdt && method !== 'usdt' && (
              <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm">
                <p className="font-semibold text-on-surface">USDT → INR conversion</p>
                <p className="mt-1 text-on-surface-variant">
                  Enter how much <span className="font-medium text-on-surface">INR</span> you want
                  in your UPI/Bank. Wallet debits USDT at{' '}
                  <span className="font-medium text-on-surface">1 USDT = ₹{usdtInrRate}</span>.
                </p>
              </div>
            )}

            <Input
              label={amountIsInrPayout ? 'Amount (INR to receive)' : `Amount (${displayCurrency})`}
              type="number"
              min={minWithdrawal}
              max={amountMax}
              step={amountIsInrPayout ? '1' : 'any'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={!!editingId}
            />

            {amountIsInrPayout && !isBusinessLinked && Number(amount) > 0 && (
              <p className="text-sm text-on-surface-variant">
                You spend{' '}
                <span className="font-semibold text-on-surface">
                  {usdtToSpend} USDT
                </span>{' '}
                from partner wallet
                {typeof maxInr === 'number' ? ` · max ~₹${maxInr}` : ''}.
              </p>
            )}

            {method === 'upi' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="UPI ID" value={upiId} onChange={(e) => setUpiId(e.target.value)} required />
                <Input
                  label="Name of Account Holder *"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  required
                />
              </div>
            )}

            {method === 'bank' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(sanitizeAccountNumber(e.target.value))}
                  inputMode="numeric"
                  maxLength={18}
                  required
                />
                <Input label="IFSC" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} required />
                <Input
                  label="Name of Account Holder"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  required
                />
                <Input
                  label="Bank name"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
                />
              </div>
            )}

            {method === 'usdt' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Wallet address"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  required
                />
                <Input label="Network" value={network} onChange={(e) => setNetwork(e.target.value)} />
              </div>
            )}

            {method === 'cdm' && (
              <Input
                label="Name of Account Holder *"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                required
              />
            )}

            {!editingId && !selectedSavedMethodId && method !== 'cdm' && (
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
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full sm:w-auto">
              Review & continue
            </Button>
          </form>
        </Card>
      )}

      <Card title="My withdrawals">
        <p className="mb-4 text-[11px] text-on-surface-variant sm:text-xs">
          Once approved (verified for payout), you cannot cancel. Contact business/admin.
        </p>
        <div className="mb-4 space-y-3 sm:mb-5 sm:space-y-4">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:gap-3">
            <div className="min-w-0 flex-1">
              <Input
                label="Search"
                icon="search"
                placeholder="Reference, UPI, account…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[420px]">
              <label className="flex flex-col gap-1 text-xs font-semibold sm:text-sm">
                Sort
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-2 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:text-sm">
                Method
                <select
                  value={methodFilter}
                  onChange={(e) => {
                    setMethodFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-2 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5"
                >
                  <option value="all">All</option>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:text-sm">
                Page
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-2 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5"
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

          <div className="chip-scroll">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  status === s.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
              {withdrawalErrorMessage(error) || 'Could not load withdrawals'}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all' || methodFilter !== 'all'
                ? 'No withdrawals match your filters'
                : 'No withdrawals yet'
            }
            icon="north_east"
          />
        ) : (
          <>
            <div className={`space-y-3 sm:space-y-4 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((w) => {
                const paid = w.paidAmount ?? 0;
                const remaining = w.remainingAmount ?? Math.max(0, w.amount - paid);
                const payments = w.payments ?? [];
                const completedPays = payments.filter((p) => p.status === 'completed');
                const pendingPays = payments.filter(
                  (p) => p.status === 'pending' && !p.disputedAt,
                );
                const disputedPays = payments.filter((p) => !!p.disputedAt);
                const expanded = expandedId === w._id;
                const pct = progressPct(paid, w.amount);
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
                    className={cn(
                      'overflow-hidden rounded-2xl border border-outline-variant/80 border-l-4 bg-surface-container-lowest shadow-sm sm:rounded-2xl',
                      w.status === 'pending'
                        ? 'border-l-amber-500'
                        : w.status === 'processing'
                          ? 'border-l-sky-500'
                          : w.status === 'completed'
                            ? 'border-l-emerald-500'
                            : w.status === 'cancelled' || w.status === 'rejected'
                              ? 'border-l-red-500'
                              : 'border-l-outline-variant',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 p-3 sm:gap-3 sm:p-5">
                      <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <span className="material-symbols-outlined text-[18px]">
                              {w.method === 'upi'
                                ? 'qr_code_2'
                                : w.method === 'bank'
                                  ? 'account_balance'
                                  : 'currency_bitcoin'}
                            </span>
                          </span>
                          <h3 className="text-base font-bold tabular-nums text-error sm:text-lg">
                            {formatCurrency(w.amount, w.currency)}
                          </h3>
                          <StatusBadge status={w.status as TransactionStatus} />
                          {(w.status === 'pending' || w.status === 'processing') && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                w.p2pListStatus === 'listed'
                                  ? 'bg-secondary/15 text-secondary'
                                  : w.p2pListStatus === 'rejected'
                                    ? 'bg-error/10 text-error'
                                    : 'bg-outline-variant/50 text-on-surface-variant'
                              }`}
                            >
                              {w.p2pListStatus === 'listed'
                                ? 'Approved'
                                : w.p2pListStatus === 'rejected'
                                  ? 'Approval rejected'
                                  : 'Awaiting approval'}
                            </span>
                          )}
                        </div>
                        <p className="break-all font-mono text-[11px] font-semibold text-primary sm:text-xs">
                          {w.referenceId}
                        </p>
                        <p className="text-[11px] text-on-surface-variant sm:text-xs">
                          {w.method.toUpperCase()} · {formatDate(w.createdAt)}
                        </p>
                        {w.sourceAmount != null && w.sourceCurrency && w.exchangeRate != null && (
                          <p className="text-[11px] text-on-surface-variant sm:text-xs">
                            Debited {w.sourceAmount} {w.sourceCurrency} @ {w.exchangeRate}
                          </p>
                        )}
                        <DestinationLine w={w} />
                        {(w.status === 'pending' || w.status === 'processing') &&
                          canCancel &&
                          tatLeft > 0 && (
                            <p className="text-[11px] font-medium text-secondary sm:text-xs">
                              You can edit or cancel for {formatSecondsMmSs(tatLeft)}
                            </p>
                          )}
                        {(w.status === 'pending' || w.status === 'processing') && !canCancel && (
                          <p className="text-[11px] text-on-surface-variant sm:text-xs">
                            {w.p2pListStatus === 'listed'
                              ? 'Once approved (verified for payout), you cannot cancel. Contact business/admin.'
                              : 'Edit/cancel window is over. Business or admin can cancel if needed.'}
                          </p>
                        )}
                      </div>

                      <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1 sm:flex-none"
                          onClick={() => setExpandedId(expanded ? null : w._id)}
                        >
                          {expanded ? 'Hide' : 'Details'}
                        </Button>
                        {canCancel && tatLeft > 0 && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1 sm:flex-none"
                              onClick={() => startEdit(w)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 sm:flex-none"
                              loading={cancel.isPending}
                              onClick={async () => {
                                const ok = await confirmDialog({
                                  title: 'Cancel withdrawal?',
                                  description: `Cancel ${w.referenceId} for ${formatCurrency(w.amount, w.currency)}? Locked balance will be released.`,
                                  confirmLabel: 'Yes, cancel',
                                  cancelLabel: 'Keep request',
                                  variant: 'danger',
                                });
                                if (ok) cancel.mutate(w._id);
                              }}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-outline-variant/70 px-3 pb-3 pt-2.5 sm:px-5 sm:pb-4 sm:pt-3">
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] sm:mb-2 sm:text-xs">
                        <span className="text-on-surface-variant">
                          Paid {formatCurrency(paid, w.currency)} · Left{' '}
                          {formatCurrency(remaining, w.currency)}
                        </span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high sm:h-2">
                        <div
                          className="h-full rounded-full bg-secondary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-on-surface-variant sm:mt-2 sm:text-xs">
                        {completedPays.length} completed
                        {pendingPays.length ? ` · ${pendingPays.length} pending` : ''}
                        {disputedPays.length ? ` · ${disputedPays.length} disputed` : ''}
                        {payments.length === 0 ? ' · No payments yet' : ''}
                      </p>
                    </div>

                    {expanded && (
                      <div className="border-t border-outline-variant bg-surface-container-low/50 px-3 py-3 sm:px-5 sm:py-4">
                        {actionError && (
                          <p className="mb-2 rounded-lg border border-error/30 bg-error-container/30 px-2.5 py-2 text-xs text-error sm:mb-3 sm:px-3">
                            {actionError}
                          </p>
                        )}
                        {payments.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-semibold">
                              {payments.length <= 1 ? 'Payment' : 'Payments'}
                            </p>
                            <p className="text-[11px] text-on-surface-variant sm:text-xs">
                              Tap Received if you got the money, or Dispute within 24 hours. After
                              that it auto-confirms.
                            </p>
                            {payments.map((p) => {
                              const acts = paymentCanAct(p);
                              const windowLabel = formatWindowLeft(acts.endsAt);
                              return (
                                <div
                                  key={p._id}
                                  className="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:px-3 sm:py-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold sm:text-base">
                                      {formatCurrency(p.amount, p.currency || w.currency)}
                                    </p>
                                    <p className="mt-0.5 break-all text-[11px] text-on-surface-variant">
                                      {p.referenceId}
                                      {p.utr ? ` · UTR ${p.utr}` : ''}
                                      {p.createdAt ? ` · ${formatDate(p.createdAt)}` : ''}
                                    </p>
                                    {p.status === 'pending' && windowLabel && !p.disputedAt && (
                                      <p className="mt-1 text-[11px] text-secondary">{windowLabel}</p>
                                    )}
                                    {p.disputedAt && (
                                      <p className="mt-1 text-[11px] text-error">
                                        Support ticket{' '}
                                        <span className="font-mono">{p.disputeTicketId || '—'}</span>
                                        {p.notes?.includes('. ')
                                          ? ` · ${p.notes.split('. ').slice(1).join('. ').trim()}`
                                          : ''}
                                      </p>
                                    )}
                                    {p.status === 'rejected' && p.rejectionReason && (
                                      <p className="mt-1 text-[11px] text-error">{p.rejectionReason}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                    {p.proofImageUrl && (
                                      <a
                                        href={p.proofImageUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-semibold text-secondary underline"
                                      >
                                        Proof
                                      </a>
                                    )}
                                    <StatusBadge status={p.disputedAt ? 'disputed' : p.status} />
                                    {acts.received && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        loading={
                                          confirmReceived.isPending &&
                                          confirmReceived.variables === p._id
                                        }
                                        onClick={async () => {
                                          setActionError('');
                                          const ok = await confirmDialog({
                                            title: 'Confirm payment received?',
                                            description: `Confirm you received ${formatCurrency(p.amount, p.currency || w.currency)}. This will mark the payment as received.`,
                                            confirmLabel: 'Yes, I received it',
                                            cancelLabel: 'Not yet',
                                            variant: 'secondary',
                                          });
                                          if (ok) confirmReceived.mutate(p._id);
                                        }}
                                      >
                                        Received
                                      </Button>
                                    )}
                                    {acts.dispute && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setActionError('');
                                          setDisputeFor(p);
                                          setDisputeReason('');
                                        }}
                                      >
                                        Dispute
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="mt-5">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </Card>

      {disputeFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-outline-variant bg-surface-container-lowest p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:max-w-md sm:rounded-2xl sm:p-5 sm:pb-5">
            <h3 className="text-base font-semibold sm:text-lg">Raise a dispute</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              Creates a support ticket with full withdrawal and payment details (UTR, proof, amounts).
              Auto-receive will pause until admin resolves it. Window: 24 hours from payment submit.
            </p>
            <p className="mt-3 break-all text-xs text-on-surface-variant">
              {disputeFor.referenceId} · {formatCurrency(disputeFor.amount, disputeFor.currency)}
              {disputeFor.utr ? ` · UTR ${disputeFor.utr}` : ''}
            </p>
            <label className="mt-4 block text-sm font-medium">
              Reason
              <textarea
                className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm"
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Payment not received, wrong amount, fake proof…"
              />
            </label>
            {actionError && <p className="mt-2 text-xs text-error">{actionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDisputeFor(null);
                  setDisputeReason('');
                  setActionError('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={raiseDispute.isPending}
                onClick={() =>
                  raiseDispute.mutate({
                    paymentId: disputeFor._id,
                    reason: disputeReason.trim() || undefined,
                  })
                }
              >
                Submit dispute
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!pendingPayload}
        onClose={() => {
          if (!create.isPending && !updateDestination.isPending) setPendingPayload(null);
        }}
        title={editingId ? 'Confirm updated details' : 'Confirm withdrawal'}
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
                <dd className="font-semibold">
                  {formatCurrency(
                    pendingPayload.amount,
                    amountIsInrPayout ? 'INR' : displayCurrency,
                  )}
                </dd>
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
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {formError}
              </div>
            )}
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
          </div>
        )}
      </Modal>
    </div>
  );
}
