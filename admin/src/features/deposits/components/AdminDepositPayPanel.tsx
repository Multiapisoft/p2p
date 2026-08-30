'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminDepositPayApi,
  type AvailableWithdrawal,
} from '@/features/deposits/api/admin-deposit-pay.api';
import { ProofUpload } from '@/features/deposits/components/ProofUpload';
import { AddressQr } from '@/shared/components/AddressQr';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import {
  normalizeUtr,
  normalizeTxHash,
  paymentRefErrorForMethod,
} from '@/shared/lib/validation';
import { buildUpiPayUri, buildUpiAppLinks, formatSecondsMmSs } from '@/shared/lib/upi-qr';
import { minPartialAmount, partialPayError } from '@/shared/lib/partial-pay';
import type { PaymentMethod } from '@/shared/types/api.types';

const PAGE_SIZES = [5, 10, 20];

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

function notifyMatchReady(amount: number) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  const title = 'Deposit match ready';
  const body = `Withdrawal available for ₹${amount.toLocaleString('en-IN')}. Open Deposits to pay.`;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: 'admin-deposit-match' });
    } catch {
      /* ignore */
    }
  }
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
              {w.bankDetails?.accountNumber && (
                <CopyBtn text={w.bankDetails.accountNumber} />
              )}
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
              {w.usdtDetails?.walletAddress && (
                <CopyBtn text={w.usdtDetails.walletAddress} />
              )}
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

export function AdminDepositPayPanel() {
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
  const [matchReadyOpen, setMatchReadyOpen] = useState(false);
  const wasWaitingRef = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

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
    () => ({ page, limit, search, sort, method }),
    [page, limit, search, sort, method],
  );

  const payAmountNum = Number(payAmount);
  const { data: creditPreview, isFetching: previewLoading } = useQuery({
    queryKey: ['admin-deposit-credit-preview', target?._id, payAmountNum],
    queryFn: () => adminDepositPayApi.previewCredit(payAmountNum, target!._id),
    enabled: !!target && Number.isFinite(payAmountNum) && payAmountNum >= 1,
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['available-withdrawals', listQuery],
    queryFn: () => adminDepositPayApi.getAvailable(listQuery),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!data) return;
    const waiting = !!data.waitingForMatch || (data.items?.length ?? 0) === 0;
    const hasItems = (data.items?.length ?? 0) > 0;
    if (wasWaitingRef.current && hasItems) {
      const first = data.items?.[0];
      setMatchReadyOpen(true);
      notifyMatchReady(first?.remainingAmount ?? first?.amount ?? 0);
    }
    wasWaitingRef.current = waiting;
  }, [data]);

  const submit = useMutation({
    mutationFn: () =>
      adminDepositPayApi.submitPayment(target!._id, {
        amount: Number(payAmount),
        utr: utr.trim()
          ? moneyCurrency(target!) === 'USDT'
            ? normalizeTxHash(utr)
            : normalizeUtr(utr)
          : undefined,
        proofImageKey: proofKey || undefined,
        proofImageUrl: proofUrl || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['available-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['admin-deposit-my-payments'] });
      qc.invalidateQueries({ queryKey: ['business-platform-payments'] });
      closePay();
    },
    onError: (err: unknown) => {
      setFormError(getApiErrorMessage(err, 'Payment submit failed'));
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
        setPayAmount(String(maxPay > 0 ? maxPay : ''));
        return;
      }
      const claimed = await adminDepositPayApi.claimWithdrawal(w._id);
      setTarget({ ...w, ...claimed });
      setClaimPayDeadline(claimed.claimPayDeadline);
      resetForm();
      const maxPay =
        claimed.maxPayable != null
          ? Math.min(claimed.maxPayable, claimed.remainingAmount)
          : claimed.remainingAmount;
      setPayAmount(String(maxPay > 0 ? maxPay : ''));
      qc.invalidateQueries({ queryKey: ['available-withdrawals'] });
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, 'Could not claim this withdrawal'));
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
  const waitingForMatch = !!data?.waitingForMatch || (!isLoading && !isError && items.length === 0);
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
      <Modal
        open={matchReadyOpen}
        onClose={() => setMatchReadyOpen(false)}
        title="Withdrawal ready"
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">New withdrawal listed for pay.</p>
          <Button type="button" className="w-full" onClick={() => setMatchReadyOpen(false)}>
            View payment details
          </Button>
        </div>
      </Modal>

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
              <option value="oldest">Oldest</option>
              <option value="newest">Newest</option>
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
          <div className="chip-scroll flex flex-wrap gap-2">
            {(['all', 'upi', 'bank', 'usdt'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMethod(m);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  method === m
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest'
                }`}
              >
                {m === 'all' ? 'All' : METHOD_META[m].label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-xl border border-error/30 bg-error-container/40 px-4 py-6 text-center">
            <p className="text-sm">
              {getApiErrorMessage(error, 'Could not load withdrawal requests')}
            </p>
            <Button type="button" className="mt-3" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : waitingForMatch ? (
          <EmptyState message="No listed withdrawals right now" icon="hourglass_top" />
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
                      <p className="text-base font-bold">
                        {formatCurrency(w.amount, moneyCurrency(w))}
                      </p>
                      <StatusBadge status={w.status} />
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase">
                        {METHOD_META[w.method].label}
                      </span>
                      {w.origin === 'investor' ? (
                        <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                          Investor
                        </span>
                      ) : (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          User
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 break-all font-mono text-[11px] text-on-surface-variant">
                      {w.referenceId} · {formatDate(w.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-secondary">
                      Open {formatCurrency(w.remainingAmount, moneyCurrency(w))}
                    </p>
                    {w.creditIfPayFull && w.remainingAmount > 0 && (
                      <p className="mt-1 text-[11px] font-semibold text-secondary">
                        Wallet credit ≈{' '}
                        {formatCurrency(
                          w.creditIfPayFull.netCredited,
                          w.creditIfPayFull.creditCurrency || 'INR',
                        )}
                      </p>
                    )}
                    <div className="mt-2">
                      <PaymentDetails w={w} />
                    </div>
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

      <Modal
        open={!!target}
        onClose={closePay}
        title="Pay withdrawal — deposit to wallet"
        className="sm:max-w-md"
      >
        {target && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {!target.assignedToMe && (
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
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Claim lock for others: {claimLockMinutes} min
                </p>
              </div>
            )}

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
                    minPartialAmount(target.method, target.currency),
                    moneyCurrency(target),
                  )}
                  .
                </p>
              );
            })()}

            {payAmountNum >= 1 && creditPreview && (
              <div
                className={`rounded-xl border border-secondary/20 bg-secondary-container/15 p-3 text-sm ${
                  previewLoading ? 'opacity-70' : ''
                }`}
              >
                <p className="text-xs font-bold uppercase text-secondary">
                  After verify you get
                </p>
                <p className="mt-1 font-bold text-secondary">
                  {formatCurrency(
                    creditPreview.netCredited,
                    creditPreview.creditCurrency || 'INR',
                  )}
                </p>
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

            <Button
              type="submit"
              className="w-full"
              loading={submit.isPending}
              disabled={payExpired}
            >
              {payExpired ? 'Time expired' : 'Submit payment'}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
