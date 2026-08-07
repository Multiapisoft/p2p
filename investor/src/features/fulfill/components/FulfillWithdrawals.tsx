'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fulfillApi, type AvailableWithdrawal } from '@/features/fulfill/api/fulfill.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ProofUpload } from '@/shared/components/ProofUpload';
import { AddressQr } from '@/shared/components/AddressQr';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import { normalizeUtr, normalizeTxHash, paymentRefErrorForMethod } from '@/shared/lib/validation';
import {
  buildUpiPayUri,
  formatSecondsMmSs,
  planAmountLabel,
} from '@/shared/lib/upi-qr';
import type { PaymentMethod } from '@/shared/types/api.types';

const PAGE_SIZES = [5, 10, 20];

const METHOD_OPTIONS: { value: PaymentMethod | 'all'; label: string }[] = [
  { value: 'all', label: 'All methods' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
];

const AVAILABLE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'remaining_desc', label: 'Remaining: high to low' },
  { value: 'remaining_asc', label: 'Remaining: low to high' },
];

const PAYMENT_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PAYMENT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'status', label: 'Status' },
];

function maskAccount(num?: string) {
  if (!num || num.length < 4) return '****';
  return `${'*'.repeat(num.length - 4)}${num.slice(-4)}`;
}

function DestinationInfo({
  w,
  payAmount,
}: {
  w: AvailableWithdrawal;
  payAmount?: number;
}) {
  if (w.method === 'upi' && w.upiDetails?.upiId) {
    const upiAmount =
      payAmount != null && payAmount > 0
        ? payAmount
        : w.maxPayable != null
          ? Math.min(w.maxPayable, w.remainingAmount)
          : w.remainingAmount;
    return (
      <div className="rounded-lg bg-surface-container-low p-3 text-sm">
        <p className="font-semibold">UPI ID</p>
        <p className="font-mono text-secondary">{w.upiDetails.upiId}</p>
        {w.upiDetails.payerName && (
          <p className="mt-1 text-on-surface-variant">Name: {w.upiDetails.payerName}</p>
        )}
        <AddressQr
          value={buildUpiPayUri({
            upiId: w.upiDetails.upiId,
            name: w.upiDetails.payerName,
            amount: upiAmount > 0 ? upiAmount : undefined,
          })}
          label="Scan UPI QR"
        />
      </div>
    );
  }
  if (w.method === 'bank' && w.bankDetails) {
    return (
      <div className="space-y-1 rounded-lg bg-surface-container-low p-3 text-sm">
        <p><span className="font-semibold">Account:</span> {maskAccount(w.bankDetails.accountNumber)}</p>
        <p><span className="font-semibold">IFSC:</span> {w.bankDetails.ifscCode}</p>
        <p><span className="font-semibold">Name:</span> {w.bankDetails.accountHolderName}</p>
      </div>
    );
  }
  if (w.method === 'usdt' && w.usdtDetails?.walletAddress) {
    return (
      <div className="rounded-lg bg-surface-container-low p-3 text-sm">
        <p className="font-semibold">USDT wallet address</p>
        <p className="mt-1 break-all font-mono text-xs text-secondary">
          {w.usdtDetails.walletAddress}
        </p>
        {w.usdtDetails.network && (
          <p className="mt-1 text-on-surface-variant">
            Network: {w.usdtDetails.network}
          </p>
        )}
        <AddressQr
          value={w.usdtDetails.walletAddress}
          label={`Scan ${w.usdtDetails.network || 'TRC20'} address`}
        />
      </div>
    );
  }
  return null;
}

function ListToolbar({
  searchInput,
  onSearchInputChange,
  sort,
  onSortChange,
  limit,
  onLimitChange,
  method,
  onMethodChange,
  showMethod = false,
  sortOptions,
}: {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  sort: string;
  onSortChange: (v: string) => void;
  limit: number;
  onLimitChange: (v: number) => void;
  method?: PaymentMethod | 'all';
  onMethodChange?: (v: PaymentMethod | 'all') => void;
  showMethod?: boolean;
  sortOptions: { value: string; label: string }[];
}) {
  return (
    <div className="mb-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <Input
            label="Search"
            icon="search"
            placeholder="Reference, UPI, UTR, account…"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
          />
        </div>
        <div className={`grid gap-3 ${showMethod ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} lg:w-[420px]`}>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Sort
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {showMethod && onMethodChange && (
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Method
              <select
                value={method}
                onChange={(e) => onMethodChange(e.target.value as PaymentMethod | 'all')}
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Per page
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20"
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
    </div>
  );
}

export function FulfillWithdrawals({
  showEarnings = true,
  showMyPayments = true,
  variant = 'fulfill',
}: {
  showEarnings?: boolean;
  showMyPayments?: boolean;
  variant?: 'fulfill' | 'invest';
}) {
  const isInvest = variant === 'invest';
  const labels = {
    earnedTitle: isInvest ? 'Investment Added (wallet)' : 'Points Earned (credited)',
    earnedHint: isInvest
      ? 'Added to total invested after admin approval'
      : 'Credited to wallet — available to withdraw',
    pendingTitle: 'Pending Approval',
    pendingHint: isInvest
      ? 'Admin will verify, then amount is added to your wallet'
      : 'Admin will verify, then points are credited',
    listTitle: isInvest
      ? 'Withdrawal Requests (Pay = Invest)'
      : 'Open Withdrawal Requests',
    emptyList:
      'No approved Platform Payment withdrawals yet. Business or admin must list a request before you can pay.',
    myTitle: isInvest ? 'My Investments (via Pay)' : 'My Fulfillments',
    myEmpty: isInvest ? 'No payments submitted yet' : 'No fulfillments yet',
    credited: isInvest ? 'Invested' : 'Points credited',
    fulfillBtn: isInvest ? 'Pay & Invest' : 'Fulfill',
    modalTitle: isInvest ? 'Pay Withdrawal (Invest)' : 'Fulfill Withdrawal',
    amountLabel: isInvest
      ? 'Amount you pay (₹)'
      : 'Amount paid (₹) — earns equal points',
    submitBtn: isInvest ? 'Submit & Add to Wallet' : 'Submit & Claim Points',
  };

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');

  const [payPage, setPayPage] = useState(1);
  const [payLimit, setPayLimit] = useState(10);
  const [paySearchInput, setPaySearchInput] = useState('');
  const [paySearch, setPaySearch] = useState('');
  const [paySort, setPaySort] = useState('newest');
  const [payStatus, setPayStatus] = useState('all');

  const [target, setTarget] = useState<AvailableWithdrawal | null>(null);
  const [claimPayDeadline, setClaimPayDeadline] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [proofKey, setProofKey] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPaySearch(paySearchInput.trim());
      setPayPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [paySearchInput]);

  useEffect(() => {
    if (!claimPayDeadline && !target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [claimPayDeadline, target]);

  const availableQuery = useMemo(
    () => ({ page, limit, search, sort, method }),
    [page, limit, search, sort, method],
  );

  const myPaymentsQuery = useMemo(
    () => ({ page: payPage, limit: payLimit, search: paySearch, sort: paySort, status: payStatus }),
    [payPage, payLimit, paySearch, paySort, payStatus],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['fulfill-available', availableQuery],
    queryFn: () => fulfillApi.getAvailable(availableQuery),
  });

  const payAmountNum = Number(amount);
  const { data: creditPreview, isFetching: previewLoading } = useQuery({
    queryKey: ['credit-preview', target?._id, payAmountNum],
    queryFn: () => fulfillApi.previewCredit(payAmountNum, target!._id),
    enabled: !!target && Number.isFinite(payAmountNum) && payAmountNum >= 1,
    placeholderData: (prev) => prev,
  });

  const {
    data: myPayments,
    isLoading: loadingPayments,
    isFetching: fetchingPayments,
    isError: paymentsError,
    error: paymentsErr,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ['fulfill-my-payments', myPaymentsQuery],
    queryFn: () => fulfillApi.getMyPayments(myPaymentsQuery),
    enabled: showEarnings || showMyPayments,
  });

  const pointsSummary = useMemo(() => {
    const items = myPayments?.items ?? [];
    let earned = 0;
    let pending = 0;
    for (const p of items) {
      if (p.status === 'completed') earned += p.netCreditedAmount ?? p.amount;
      else if (p.status === 'pending') pending += p.amount;
    }
    return { earned, pending };
  }, [myPayments]);

  const selectPlan = useMutation({
    mutationFn: (planAmount: number) => fulfillApi.setInvestorPlan(planAmount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfill-available'] });
    },
  });

  const submit = useMutation({
    mutationFn: () =>
      fulfillApi.submitPayment(target!._id, {
        amount: Number(amount),
        utr: target!.method === 'usdt' ? normalizeTxHash(utr) : normalizeUtr(utr),
        proofImageKey: proofKey,
        proofImageUrl: proofUrl,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fulfill-available'] });
      qc.invalidateQueries({ queryKey: ['fulfill-my-payments'] });
      closePay();
    },
    onError: (err: unknown) => {
      setFormError(apiErrorMessage(err, 'Submission failed. Please check your details.'));
    },
  });

  const resetForm = () => {
    setAmount('');
    setUtr('');
    setProofKey('');
    setProofUrl('');
    setFormError('');
  };

  const closePay = () => {
    setTarget(null);
    setClaimPayDeadline(null);
    resetForm();
  };

  const openPay = async (w: AvailableWithdrawal) => {
    setFormError('');
    setClaimingId(w._id);
    try {
      const claimed = await fulfillApi.claimWithdrawal(w._id);
      setTarget({ ...w, ...claimed });
      setClaimPayDeadline(claimed.claimPayDeadline);
      resetForm();
      const maxPay =
        claimed.maxPayable != null
          ? Math.min(claimed.maxPayable, claimed.remainingAmount)
          : claimed.remainingAmount;
      setAmount(String(maxPay > 0 ? maxPay : claimed.remainingAmount));
      qc.invalidateQueries({ queryKey: ['fulfill-available'] });
    } catch (err: unknown) {
      setFormError(apiErrorMessage(err, 'Could not claim this withdrawal'));
    } finally {
      setClaimingId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (payExpired) {
      setFormError('Submit window ended. Payment will not be accepted.');
      return;
    }
    const num = Number(amount);
    if (!target || !num || num < 1) {
      setFormError('Please enter a valid amount');
      return;
    }
    const maxPay =
      target.maxPayable != null
        ? Math.min(target.maxPayable, target.remainingAmount)
        : target.remainingAmount;
    if (num > maxPay) {
      setFormError(
        target.p2pPayRemainingInr != null
          ? `Max payable is ${maxPay} (business limit remaining ₹${target.p2pPayRemainingInr})`
          : `Maximum remaining amount is ${maxPay}`,
      );
      return;
    }
    const refErr = paymentRefErrorForMethod(utr, target.method);
    if (refErr) {
      setFormError(refErr);
      return;
    }
    if (!proofKey || !proofUrl) {
      setFormError('Please upload a payment screenshot');
      return;
    }
    submit.mutate();
  };

  const availableItems = data?.items ?? [];
  const availableTotal = data?.total ?? 0;
  const availableTotalPages = data?.totalPages ?? 1;
  const needsPlan = isInvest && !!data?.needsPlan;
  const planAmounts = data?.planAmounts ?? [25000, 50000, 100000, 200000];
  const claimLockMinutes = data?.claimLockMinutes ?? 7;
  const paySecondsLeft = claimPayDeadline
    ? Math.max(0, Math.ceil((new Date(claimPayDeadline).getTime() - now) / 1000))
    : 0;
  const payExpired = !!claimPayDeadline && paySecondsLeft <= 0;

  const paymentItems = myPayments?.items ?? [];
  const paymentsTotal = myPayments?.total ?? 0;
  const paymentsTotalPages = myPayments?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {formError && !target && (
        <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {formError}
        </div>
      )}

      {isInvest && data && !needsPlan && data.planAmount != null && data.targetAmount != null && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-on-surface-variant">
                Your plan · {planAmountLabel(data.planAmount)}
              </p>
              <p className="mt-1 text-2xl font-bold text-secondary">
                Target {formatCurrency(data.targetAmount)}
              </p>
            </div>
            <p className="text-sm text-on-surface-variant">
              Paid toward plan{' '}
              <span className="font-semibold text-on-surface">
                {formatCurrency(data.paidTowardPlan ?? 0)}
              </span>
              {' / '}
              {formatCurrency(data.targetAmount)}
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-secondary"
              style={{
                width: `${Math.min(
                  100,
                  data.targetAmount > 0
                    ? ((data.paidTowardPlan ?? 0) / data.targetAmount) * 100
                    : 0,
                )}%`,
              }}
            />
          </div>
        </Card>
      )}

      {showEarnings && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-sm text-on-surface-variant">{labels.earnedTitle}</p>
            <p className="mt-1 text-2xl font-bold text-secondary">
              {formatCurrency(pointsSummary.earned)}
            </p>
            <p className="mt-1 text-xs text-outline">{labels.earnedHint}</p>
          </Card>
          <Card>
            <p className="text-sm text-on-surface-variant">{labels.pendingTitle}</p>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(pointsSummary.pending)}</p>
            <p className="mt-1 text-xs text-outline">{labels.pendingHint}</p>
          </Card>
        </div>
      )}

      <Card title={labels.listTitle}>
        <ListToolbar
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          sort={sort}
          onSortChange={(v) => {
            setSort(v);
            setPage(1);
          }}
          limit={limit}
          onLimitChange={(v) => {
            setLimit(v);
            setPage(1);
          }}
          method={method}
          onMethodChange={(v) => {
            setMethod(v);
            setPage(1);
          }}
          showMethod
          sortOptions={AVAILABLE_SORT_OPTIONS}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          {METHOD_OPTIONS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => {
                setMethod(m.value);
                setPage(1);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                method === m.value
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
              {apiErrorMessage(error, 'Could not load withdrawal requests')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : needsPlan ? (
          <EmptyState
            message="Select an investment plan to see available withdrawals."
            icon="payments"
          />
        ) : !availableItems.length ? (
          <EmptyState
            message={
              search || method !== 'all' ? 'No requests match your filters' : labels.emptyList
            }
            icon="payments"
          />
        ) : (
          <>
            <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {availableItems.map((w) => (
                <div key={w._id} className="rounded-xl border border-outline-variant p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{formatCurrency(w.amount, w.currency)}</p>
                      <p className="text-xs text-on-surface-variant">
                        {w.referenceId} · {w.method.toUpperCase()} · {formatDate(w.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm">
                        <span className="rounded-full bg-secondary-container px-2 py-0.5 font-semibold text-on-secondary-container">
                          Paid: {formatCurrency(w.paidAmount, w.currency)}
                        </span>
                        <span className="rounded-full bg-primary-container px-2 py-0.5 font-semibold text-on-primary-container">
                          Remaining: {formatCurrency(w.remainingAmount, w.currency)}
                        </span>
                      </div>
                      {isInvest && w.creditIfPayFull && w.remainingAmount > 0 && (
                        <p className="mt-2 text-xs font-semibold text-secondary">
                          You get{' '}
                          {formatCurrency(
                            w.creditIfPayFull.netCredited,
                            w.creditIfPayFull.creditCurrency || 'INR',
                          )}
                          {w.creditIfPayFull.bonusAmount > 0
                            ? ` (+${formatCurrency(w.creditIfPayFull.bonusAmount, 'INR')} bonus)`
                            : ''}
                          {w.currency?.toUpperCase() === 'USDT' && w.creditIfPayFull.exchangeRate
                            ? ` @ ${w.creditIfPayFull.exchangeRate} INR/USDT`
                            : ''}{' '}
                          if you pay full open
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={w.status} />
                      <Button
                        size="sm"
                        onClick={() => openPay(w)}
                        loading={claimingId === w._id}
                        disabled={claimingId === w._id}
                      >
                        {labels.fulfillBtn}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <DestinationInfo w={w} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <Pagination
                page={page}
                totalPages={availableTotalPages}
                total={availableTotal}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </Card>

      {showMyPayments && (
        <Card title={labels.myTitle}>
          <ListToolbar
            searchInput={paySearchInput}
            onSearchInputChange={setPaySearchInput}
            sort={paySort}
            onSortChange={(v) => {
              setPaySort(v);
              setPayPage(1);
            }}
            limit={payLimit}
            onLimitChange={(v) => {
              setPayLimit(v);
              setPayPage(1);
            }}
            sortOptions={PAYMENT_SORT_OPTIONS}
          />

          <div className="mb-4 flex flex-wrap gap-2">
            {PAYMENT_STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setPayStatus(s.value);
                  setPayPage(1);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  payStatus === s.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {loadingPayments ? (
            <LoadingScreen />
          ) : paymentsError ? (
            <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
              <p className="text-sm font-medium text-on-surface">
                {apiErrorMessage(paymentsErr, 'Could not load your payments')}
              </p>
              <Button type="button" className="mt-4" onClick={() => refetchPayments()}>
                Retry
              </Button>
            </div>
          ) : !paymentItems.length ? (
            <EmptyState
              message={
                paySearch || payStatus !== 'all'
                  ? 'No payments match your filters'
                  : labels.myEmpty
              }
              icon="receipt"
            />
          ) : (
            <>
              <div className={`space-y-3 ${fetchingPayments ? 'opacity-70' : ''}`}>
                {paymentItems.map((p) => (
                  <div
                    key={p._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant p-4"
                  >
                    <div>
                      <p className="font-semibold">{formatCurrency(p.amount, p.currency)}</p>
                      <p className="text-xs text-on-surface-variant">
                        {p.referenceId} · UTR: {p.utr} · {formatDate(p.createdAt)}
                      </p>
                      {p.netCreditedAmount ? (
                        <p className="text-xs text-secondary">
                          {labels.credited}: {formatCurrency(p.netCreditedAmount, 'INR')}
                          {p.bonusAmount
                            ? ` (incl. bonus ${formatCurrency(p.bonusAmount, 'INR')})`
                            : ''}
                        </p>
                      ) : p.estimatedNetCredited ? (
                        <p className="text-xs text-on-surface-variant">
                          Est. credit: {formatCurrency(p.estimatedNetCredited, 'INR')}
                          {p.estimatedBonusAmount
                            ? ` (+${formatCurrency(p.estimatedBonusAmount, 'INR')} bonus)`
                            : ''}
                        </p>
                      ) : null}
                      {p.rejectionReason && (
                        <p className="text-xs text-error">Reason: {p.rejectionReason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      <a
                        href={p.proofImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-secondary hover:underline"
                      >
                        Proof
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <Pagination
                  page={payPage}
                  totalPages={paymentsTotalPages}
                  total={paymentsTotal}
                  limit={payLimit}
                  onPageChange={setPayPage}
                />
              </div>
            </>
          )}
        </Card>
      )}

      <Modal
        open={needsPlan}
        onClose={() => undefined}
        title="Choose investment plan"
        className="sm:max-w-md"
      >
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">
            Pick a plan to unlock Platform Payment withdrawals. Your target is plan × multiplier
            from platform settings.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {planAmounts.map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={selectPlan.isPending}
                onClick={() => selectPlan.mutate(amt)}
                className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-4 text-center transition hover:border-secondary hover:bg-secondary-container/20 disabled:opacity-60"
              >
                <p className="text-lg font-bold text-secondary">{planAmountLabel(amt)}</p>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  {formatCurrency(amt)}
                </p>
              </button>
            ))}
          </div>
          {selectPlan.isError && (
            <p className="text-xs text-error">
              {apiErrorMessage(selectPlan.error, 'Could not save plan')}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!target}
        onClose={closePay}
        title={labels.modalTitle}
        footer={
          target ? (
            <Button
              type="submit"
              form="fulfill-pay-form"
              className="w-full"
              loading={submit.isPending}
              disabled={payExpired}
            >
              {payExpired ? 'Time expired' : labels.submitBtn}
            </Button>
          ) : null
        }
      >
        {target && (
          <form id="fulfill-pay-form" onSubmit={handleSubmit} className="space-y-4">
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                payExpired
                  ? 'border-error/40 bg-error-container/40'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wide">
                Submit within {formatSecondsMmSs(paySecondsLeft)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-on-surface">
                If you submit after time ends, payment will not be accepted
              </p>
              <p className="mt-1 text-[10px] text-on-surface-variant">
                This withdrawal stays locked for others for {claimLockMinutes} min
                (claim lock).
              </p>
            </div>

            <div className="rounded-lg bg-surface-container-low p-3 text-sm">
              <p>Total: {formatCurrency(target.amount, target.currency)}</p>
              <p>
                Open:{' '}
                <strong>{formatCurrency(target.remainingAmount, target.currency)}</strong>
              </p>
              <p>
                Pay up to:{' '}
                <strong>
                  {formatCurrency(
                    target.maxPayable != null
                      ? Math.min(target.maxPayable, target.remainingAmount)
                      : target.remainingAmount,
                    target.currency,
                  )}
                </strong>
              </p>
              {target.p2pPayRemainingInr != null && (
                <p className="mt-1 text-xs text-amber-700">
                  Business Platform Payment limit remaining: ₹{target.p2pPayRemainingInr}
                </p>
              )}
            </div>

            <DestinationInfo
              w={target}
              payAmount={payAmountNum >= 1 ? payAmountNum : undefined}
            />

            <Input
              label={labels.amountLabel}
              type="number"
              min={1}
              max={
                target.maxPayable != null
                  ? Math.min(target.maxPayable, target.remainingAmount)
                  : target.remainingAmount
              }
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={payExpired}
            />

            {isInvest && payAmountNum >= 1 && (
              <div
                className={`rounded-xl border border-secondary/30 bg-secondary-container/20 p-3 text-sm ${
                  previewLoading ? 'opacity-70' : ''
                }`}
              >
                <p className="font-semibold text-on-surface">After verification you get</p>
                {creditPreview ? (
                  <div className="mt-2 space-y-1 text-on-surface-variant">
                    <p>
                      You pay:{' '}
                      <span className="font-semibold text-on-surface">
                        {formatCurrency(creditPreview.payAmount, target.currency)}
                      </span>
                      {target.currency?.toUpperCase() === 'USDT' &&
                        creditPreview.payAmountInr != null && (
                          <span className="text-xs">
                            {' '}
                            (≈ {formatCurrency(creditPreview.payAmountInr, 'INR')}
                            {creditPreview.exchangeRate
                              ? ` @ ${creditPreview.exchangeRate}`
                              : ''}
                            )
                          </span>
                        )}
                    </p>
                    {creditPreview.bonusAmount > 0 && (
                      <p>
                        Investor bonus:{' '}
                        <span className="font-semibold text-secondary">
                          +{formatCurrency(creditPreview.bonusAmount, 'INR')}
                        </span>
                      </p>
                    )}
                    <p className="border-t border-outline-variant pt-2 text-base">
                      Wallet credit (INR points):{' '}
                      <span className="font-bold text-secondary">
                        {formatCurrency(
                          creditPreview.netCredited,
                          creditPreview.creditCurrency || 'INR',
                        )}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-on-surface-variant">Calculating…</p>
                )}
              </div>
            )}

            <ProofUpload
              utr={utr}
              onUtrChange={setUtr}
              onUploaded={(key, url) => {
                setProofKey(key);
                setProofUrl(url);
              }}
              disabled={submit.isPending || payExpired}
              referenceKind={target.method === 'usdt' ? 'txid' : 'utr'}
            />

            {formError && (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {formError}
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
