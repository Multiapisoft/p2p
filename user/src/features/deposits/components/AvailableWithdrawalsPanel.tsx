'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  p2pPayApi,
  type AvailableWithdrawal,
} from '@/features/deposits/api/p2p-pay.api';
import { ProofUpload } from '@/shared/components/ProofUpload';
import { AddressQr } from '@/shared/components/AddressQr';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import { normalizeUtr, normalizeTxHash, paymentRefErrorForMethod } from '@/shared/lib/validation';
import { buildUpiPayUri, buildUpiAppLinks, formatSecondsMmSs } from '@/shared/lib/upi-qr';
import { liveQueryOptions } from '@/shared/constants/live-query';
import { minPartialAmount, partialPayError } from '@/shared/lib/partial-pay';
import { DepositAmountModal } from '@/features/deposits/components/DepositAmountModal';
import { profileApi } from '@/features/profile/api/profile.api';
import type { PaymentMethod } from '@/shared/types/api.types';

const PAGE_SIZES = [5, 10, 20];
const MATCH_AMOUNT_KEY = 'p2p-match-amount';

function readStoredMatchAmount() {
  if (typeof window === 'undefined') return null;
  const n = Number(sessionStorage.getItem(MATCH_AMOUNT_KEY));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

import {
  filterDepositMethodTabs,
  resolveUserDepositMethods,
  filterWithdrawalMethodOptions,
  resolveUserWithdrawalMethods,
} from '@/shared/lib/payment-methods';

const METHOD_META: Record<PaymentMethod, { label: string; icon: string }> = {
  upi: { label: 'UPI', icon: 'qr_code_2' },
  bank: { label: 'Bank', icon: 'account_balance' },
  usdt: { label: 'USDT', icon: 'currency_bitcoin' },
  cdm: { label: 'CDM', icon: 'atm' },
};

function moneyCurrency(w: { currency?: string; method?: string }) {
  if (w.method === 'usdt' || (w.currency || '').toUpperCase() === 'USDT') return 'USDT';
  return w.currency || 'INR';
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-[10px] font-semibold text-secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function PaymentDetails({
  w,
  payAmount,
}: {
  w: AvailableWithdrawal;
  payAmount?: number;
}) {
  const upiAmount =
    payAmount != null && payAmount > 0
      ? payAmount
      : w.maxPayable != null
        ? Math.min(w.maxPayable, w.remainingAmount)
        : w.remainingAmount;
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low/60 p-3 text-sm">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
        {METHOD_META[w.method].label} details
      </p>
      {w.method === 'upi' && (
        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-on-surface-variant">UPI ID</span>
            <span className="flex items-center gap-1 break-all font-medium">
              {w.upiDetails?.upiId}
              {w.upiDetails?.upiId && <CopyBtn text={w.upiDetails.upiId} />}
            </span>
          </div>
          {w.upiDetails?.payerName && (
            <div className="flex justify-between gap-2">
              <span className="text-on-surface-variant">Name</span>
              <span className="font-medium">{w.upiDetails.payerName}</span>
            </div>
          )}
          {w.upiDetails?.upiId && (
            <>
              <AddressQr
                value={buildUpiPayUri({
                  upiId: w.upiDetails.upiId,
                  name: w.upiDetails.payerName,
                  amount: upiAmount > 0 ? upiAmount : undefined,
                })}
                label="Scan UPI QR"
              />
              <div className="flex flex-wrap gap-2 pt-2">
                {buildUpiAppLinks({
                  upiId: w.upiDetails.upiId,
                  name: w.upiDetails.payerName,
                  amount: upiAmount > 0 ? upiAmount : undefined,
                }).map((app) => (
                  <a
                    key={app.id}
                    href={app.href}
                    className="rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-semibold text-secondary"
                  >
                    Pay with {app.label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {w.method === 'bank' && (
        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-on-surface-variant">Account</span>
            <span className="flex items-center gap-1 font-medium">
              {w.bankDetails?.accountNumber}
              {w.bankDetails?.accountNumber && <CopyBtn text={w.bankDetails.accountNumber} />}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-on-surface-variant">IFSC</span>
            <span className="flex items-center gap-1 font-medium">
              {w.bankDetails?.ifscCode}
              {w.bankDetails?.ifscCode && <CopyBtn text={w.bankDetails.ifscCode} />}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-on-surface-variant">Holder</span>
            <span className="font-medium">{w.bankDetails?.accountHolderName}</span>
          </div>
        </div>
      )}
      {w.method === 'usdt' && (
        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-on-surface-variant">Network</span>
            <span className="font-medium">{w.usdtDetails?.network || 'TRC20'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-on-surface-variant">Address</span>
            <span className="flex max-w-[70%] items-center gap-1 break-all font-medium">
              {w.usdtDetails?.walletAddress}
              {w.usdtDetails?.walletAddress && <CopyBtn text={w.usdtDetails.walletAddress} />}
            </span>
          </div>
          {w.usdtDetails?.walletAddress && (
            <AddressQr
              value={w.usdtDetails.walletAddress}
              label={`Scan ${w.usdtDetails.network || 'TRC20'} address`}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function AvailableWithdrawalsPanel({
  preferredAmount,
}: {
  preferredAmount?: number;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
  const [sort, setSort] = useState('oldest');
  const [target, setTarget] = useState<AvailableWithdrawal | null>(null);
  const [claimPayDeadline, setClaimPayDeadline] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [proofKey, setProofKey] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [matchAmount, setMatchAmount] = useState<number | null>(null);
  const [matchInput, setMatchInput] = useState('');
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const qc = useQueryClient();

  const applyMatchAmount = (n: number) => {
    setMatchAmount(n);
    setMatchInput(String(n));
    setPage(1);
    setAmountModalOpen(false);
    sessionStorage.setItem(MATCH_AMOUNT_KEY, String(n));
  };

  useEffect(() => {
    const fromUrl =
      preferredAmount && preferredAmount >= 1 ? preferredAmount : null;
    if (fromUrl) {
      applyMatchAmount(fromUrl);
      return;
    }
    const stored = readStoredMatchAmount();
    if (stored) setMatchInput(String(stored));
    setAmountModalOpen(true);
  }, [preferredAmount]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!claimPayDeadline && !target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [claimPayDeadline, target]);

  const listQuery = useMemo(
    () => ({ page, limit, search, sort, method, amount: matchAmount ?? undefined }),
    [page, limit, search, sort, method, matchAmount],
  );

  const payAmountNum = Number(payAmount);
  const { data: creditPreview, isFetching: previewLoading } = useQuery({
    queryKey: ['deposit-credit-preview', target?._id, payAmountNum],
    queryFn: () => p2pPayApi.previewCredit(payAmountNum, target!._id),
    enabled: !!target && Number.isFinite(payAmountNum) && payAmountNum >= 1,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: () => profileApi.getMe(),
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['available-withdrawals', listQuery],
    queryFn: () => p2pPayApi.getAvailable(listQuery),
    ...liveQueryOptions,
  });

  const allowedDepositMethods = useMemo(
    () =>
      resolveUserDepositMethods(
        profile?.referredBusiness?.allowedDepositMethods ??
          data?.allowedDepositMethods,
      ),
    [
      profile?.referredBusiness?.allowedDepositMethods,
      data?.allowedDepositMethods,
    ],
  );

  const methodTabs = useMemo(
    () => filterDepositMethodTabs(allowedDepositMethods),
    [allowedDepositMethods],
  );

  useEffect(() => {
    if (!methodTabs.length) return;
    if (!methodTabs.some((t) => t.value === method)) {
      setMethod(methodTabs[0]?.value ?? 'all');
    }
  }, [methodTabs, method]);

  const submit = useMutation({
    mutationFn: () =>
      p2pPayApi.submitPayment(target!._id, {
        amount: Number(payAmount),
        utr: utr.trim()
          ? moneyCurrency(target!) === 'USDT'
            ? normalizeTxHash(utr)
            : normalizeUtr(utr)
          : undefined,
        proofImageKey: proofKey || undefined,
        proofImageUrl: proofUrl || undefined,
      }),
    onSuccess: (payment) => {
      qc.invalidateQueries({ queryKey: ['available-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['my-p2p-payments'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      closePay();

      try {
        const raw = sessionStorage.getItem('partner_deposit_ctx');
        if (raw) {
          const ctx = JSON.parse(raw) as {
            returnUrl?: string;
            externalRef?: string;
          };
          sessionStorage.removeItem('partner_deposit_ctx');
          if (ctx.returnUrl) {
            const url = new URL(ctx.returnUrl);
            url.searchParams.set('status', payment.status || 'pending');
            url.searchParams.set('type', 'deposit');
            url.searchParams.set('referenceId', payment.referenceId || '');
            url.searchParams.set('amount', String(payment.amount ?? ''));
            if (ctx.externalRef) url.searchParams.set('externalRef', ctx.externalRef);
            window.location.href = url.toString();
            return;
          }
        }
      } catch {
        /* stay on FinGuard */
      }
    },
    onError: (err: unknown) => {
      setFormError(apiErrorMessage(err, 'Payment submit failed'));
    },
  });

  const resetForm = () => {
    setPayAmount('');
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
      if (w.assignedToMe) {
        setTarget(w);
        setClaimPayDeadline(null);
        resetForm();
        const maxPay =
          w.maxPayable != null
            ? Math.min(w.maxPayable, w.remainingAmount)
            : w.remainingAmount;
        const pref =
          preferredAmount && preferredAmount >= 1
            ? preferredAmount
            : matchAmount && matchAmount >= 1
              ? matchAmount
              : maxPay;
        setPayAmount(String(Math.min(pref, maxPay) > 0 ? Math.min(pref, maxPay) : maxPay));
        return;
      }
      const claimed = await p2pPayApi.claimWithdrawal(w._id);
      setTarget({ ...w, ...claimed });
      setClaimPayDeadline(claimed.claimPayDeadline);
      resetForm();
      const maxPay =
        claimed.maxPayable != null
          ? Math.min(claimed.maxPayable, claimed.remainingAmount)
          : claimed.remainingAmount;
      const pref =
        (preferredAmount && preferredAmount >= 1
          ? preferredAmount
          : matchAmount && matchAmount >= 1
            ? matchAmount
            : maxPay);
      setPayAmount(String(Math.min(pref, maxPay) > 0 ? Math.min(pref, maxPay) : maxPay));
      qc.invalidateQueries({ queryKey: ['available-withdrawals'] });
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
    const num = Number(payAmount);
    if (!target || !num || num < 1) {
      setFormError('Enter a valid amount');
      return;
    }
    const maxPay =
      target.maxPayable != null
        ? Math.min(target.maxPayable, target.remainingAmount)
        : target.remainingAmount;
    if (num > maxPay) {
      setFormError(`Max open amount is ${formatCurrency(maxPay, moneyCurrency(target))}`);
      return;
    }
    const partialErr = partialPayError({
      amount: num,
      remaining: target.remainingAmount,
      maxPayable: maxPay,
      method: target.method,
      currency: target.currency,
      allowPartial: target.allowPartialPay,
      minPartial: target.minPartialPay,
    });
    if (partialErr) {
      setFormError(partialErr);
      return;
    }
    const refErr = utr.trim() ? paymentRefErrorForMethod(utr, target.method) : null;
    if (target.assignedToMe) {
      if (!utr.trim() && !proofKey) {
        setFormError('Upload a UTR or payment proof');
        return;
      }
      if (refErr) {
        setFormError(refErr);
        return;
      }
    } else {
      if (refErr) {
        setFormError(refErr);
        return;
      }
      if (!proofKey || !proofUrl) {
        setFormError('Upload payment screenshot');
        return;
      }
    }
    submit.mutate();
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const needsAmount = !matchAmount || !!data?.needsAmount;
  const claimLockMinutes = data?.claimLockMinutes ?? 7;
  const paySecondsLeft = claimPayDeadline
    ? Math.max(0, Math.ceil((new Date(claimPayDeadline).getTime() - now) / 1000))
    : 0;
  const payExpired =
    !target?.assignedToMe && !!claimPayDeadline && paySecondsLeft <= 0;

  return (
    <>
      {formError && !target && (
        <div className="mb-3 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {formError}
        </div>
      )}
      <DepositAmountModal
        open={amountModalOpen}
        initialValue={matchInput}
        onClose={() => setAmountModalOpen(false)}
        onApply={applyMatchAmount}
      />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Deposit amount
            </p>
            <p className="text-lg font-bold text-secondary">
              {matchAmount != null ? formatCurrency(matchAmount) : 'Enter amount first'}
            </p>
          </div>
          <Button type="button" size="sm" variant={matchAmount ? 'outline' : 'primary'} onClick={() => setAmountModalOpen(true)}>
            {matchAmount != null ? 'Change amount' : 'Enter amount'}
          </Button>
        </div>
      </Card>
      <Card title="Available Details for Payment">
        <div className="mb-3 space-y-2">
          <Input
            icon="search"
            placeholder="Search reference, UPI, account…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="amount_desc">Amount high–low</option>
              <option value="amount_asc">Amount low–high</option>
            </select>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
          <div className="chip-scroll">
            {methodTabs.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setMethod(t.value);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  method === t.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
            <p className="text-sm">{apiErrorMessage(error, 'Could not load withdrawal requests')}</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Make sure the backend is running on port 9091, then retry.
            </p>
            <Button type="button" className="mt-3" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : needsAmount && !items.length ? (
          <EmptyState
            message="Enter amount first."
            icon="payments"
          />
        ) : !items.length ? (
          <EmptyState message="No matches." icon="payments" />
        ) : (
          <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((w) => (
              <div
                key={w._id}
                className="space-y-3 rounded-lg border border-outline-variant p-3 sm:rounded-xl sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-secondary">
                        {METHOD_META[w.method].icon}
                      </span>
                      <p className="text-base font-bold">{formatCurrency(w.amount, moneyCurrency(w))}</p>
                      <StatusBadge status={w.status} />
                      {w.priority ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                          Highlighted
                        </span>
                      ) : null}
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase">
                        {METHOD_META[w.method].label}
                      </span>
                      {w.origin === 'business' ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          Business
                        </span>
                      ) : null}
                      {w.assignedToMe ? (
                        <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                          Assigned to you
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 break-all font-mono text-[11px] text-on-surface-variant">
                      {w.referenceId} · {formatDate(w.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-secondary">
                      Open {formatCurrency(w.remainingAmount, moneyCurrency(w))}
                      {(w.reservedAmount || 0) > 0
                        ? ` · Locked ${formatCurrency(w.reservedAmount!, moneyCurrency(w))}`
                        : ''}
                    </p>
                    {w.creditIfPayFull && w.remainingAmount > 0 && (
                      <p className="mt-1 text-[11px] font-semibold text-secondary">
                        Credit if you pay full ≈{' '}
                        {formatCurrency(
                          w.creditIfPayFull.netCredited,
                          w.creditIfPayFull.creditCurrency || 'INR',
                        )}
                        {w.creditIfPayFull.bonusAmount > 0
                          ? ` (+${formatCurrency(w.creditIfPayFull.bonusAmount)} bonus)`
                          : ''}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={w.remainingAmount <= 0 || claimingId === w._id}
                    loading={claimingId === w._id}
                    onClick={() => openPay(w)}
                  >
                    Pay now
                  </Button>
                </div>
              </div>
            ))}
            <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <Modal open={!!target} onClose={closePay} title="Pay withdrawal request" className="sm:max-w-md">
        {target && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {target.assignedToMe ? (
            <div className="rounded-xl border border-secondary/30 bg-secondary-container/30 px-3 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-secondary">
                Assigned to you
              </p>
              <p className="mt-1 text-[11px] font-medium text-on-surface">
                This request is assigned to you. Upload a UTR or payment proof to pay.
              </p>
            </div>
            ) : (
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
            )}

            <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low p-2.5 text-center text-xs">
              <div>
                <p className="text-on-surface-variant">Total</p>
                <p className="font-bold">{formatCurrency(target.amount, moneyCurrency(target))}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Locked</p>
                <p className="font-bold">
                  {formatCurrency(target.reservedAmount ?? 0, moneyCurrency(target))}
                </p>
              </div>
              <div>
                <p className="text-secondary">Pay up to</p>
                <p className="font-bold text-secondary">
                  {formatCurrency(
                    target.maxPayable != null
                      ? Math.min(target.maxPayable, target.remainingAmount)
                      : target.remainingAmount,
                    moneyCurrency(target),
                  )}
                </p>
              </div>
            </div>

            <PaymentDetails
              w={target}
              payAmount={payAmountNum >= 1 ? payAmountNum : undefined}
            />

            <Input
              label={moneyCurrency(target) === 'USDT' ? 'Amount (USDT)' : 'Amount (₹)'}
              type="number"
              min={1}
              max={
                target.maxPayable != null
                  ? Math.min(target.maxPayable, target.remainingAmount)
                  : target.remainingAmount
              }
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              required
              disabled={payExpired}
            />
            {(() => {
              const maxPay =
                target.maxPayable != null
                  ? Math.min(target.maxPayable, target.remainingAmount)
                  : target.remainingAmount;
              const isFullPay =
                Number.isFinite(payAmountNum) &&
                payAmountNum >= 1 &&
                payAmountNum >= maxPay - 0.001;
              if (isFullPay) return null;
              return (
                <p className="text-[11px] text-on-surface-variant">
                  Min amount{' '}
                  {formatCurrency(
                    minPartialAmount(target.method, target.currency, target.minPartialPay),
                    moneyCurrency(target),
                  )}
                  . Smaller leftover only as full pay.
                </p>
              );
            })()}

            {payAmountNum >= 1 && creditPreview && (
              <div
                className={`rounded-xl border border-secondary/20 bg-secondary-container/15 p-3 text-sm ${
                  previewLoading ? 'opacity-70' : ''
                }`}
              >
                <p className="text-xs font-bold uppercase text-secondary">After verify you get</p>
                <p className="mt-1 font-bold text-secondary">
                  {formatCurrency(creditPreview.netCredited, creditPreview.creditCurrency || 'INR')}
                </p>
                {creditPreview.bonusAmount > 0 && (
                  <p className="text-xs text-on-surface-variant">
                    incl. bonus +{formatCurrency(creditPreview.bonusAmount)}
                  </p>
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
              disabled={payExpired}
              referenceKind={moneyCurrency(target) === 'USDT' ? 'txid' : 'utr'}
              utrRequired={!target.assignedToMe}
            />

            {formError && (
              <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" loading={submit.isPending} disabled={payExpired}>
              {payExpired ? 'Time expired' : 'Submit payment'}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}

export function MyP2pPaymentsPanel() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['my-p2p-payments', page, limit],
    queryFn: () => p2pPayApi.getMyPayments({ page, limit }),
    ...liveQueryOptions,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <Card title="My Platform payments">
      {isLoading ? (
        <LoadingScreen />
      ) : isError ? (
        <div className="rounded-xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
          <p className="text-sm">{apiErrorMessage(error, 'Could not load payments')}</p>
          <Button type="button" className="mt-3" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !items.length ? (
        <EmptyState message="No Platform payments yet" icon="receipt_long" />
      ) : (
        <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
          {items.map((p) => (
            <div
              key={p._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant p-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">{formatCurrency(p.amount, p.currency)}</p>
                <p className="break-all text-[11px] text-on-surface-variant">
                  {p.referenceId} · UTR {p.utr} · {formatDate(p.createdAt)}
                </p>
                {p.netCreditedAmount != null && p.status === 'completed' && (
                  <p className="mt-0.5 text-[11px] text-secondary">
                    Credited {formatCurrency(p.netCreditedAmount)}
                  </p>
                )}
                {p.rejectionReason && (
                  <p className="mt-0.5 text-[11px] text-error">{p.rejectionReason}</p>
                )}
              </div>
              <StatusBadge status={p.status} />
            </div>
          ))}
          <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} />
        </div>
      )}
    </Card>
  );
}
