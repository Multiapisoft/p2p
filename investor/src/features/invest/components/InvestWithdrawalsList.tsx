'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fulfillApi, type AvailableWithdrawal } from '@/features/fulfill/api/fulfill.api';
import { investorApi } from '@/features/investor/api/investor.api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Modal } from '@/shared/components/ui/Modal';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ProofUpload } from '@/shared/components/ProofUpload';
import { AddressQr } from '@/shared/components/AddressQr';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { apiErrorMessage, formatCurrency, formatDate } from '@/shared/lib/utils';
import type { PaymentMethod } from '@/shared/types/api.types';

const PAGE_SIZES = [5, 10, 20];

type SortKey = 'amount_desc' | 'amount_asc' | 'remaining_desc' | 'remaining_asc' | 'newest' | 'oldest';

const METHOD_META: Record<PaymentMethod, { label: string; icon: string; color: string }> = {
  upi: { label: 'UPI', icon: 'qr_code_2', color: 'text-blue-600 bg-blue-500/10' },
  bank: { label: 'Bank', icon: 'account_balance', color: 'text-violet-600 bg-violet-500/10' },
  usdt: { label: 'USDT', icon: 'currency_bitcoin', color: 'text-orange-600 bg-orange-500/10' },
};

function moneyCurrency(w: { currency?: string; method?: string }) {
  if (w.method === 'usdt' || (w.currency || '').toUpperCase() === 'USDT') return 'USDT';
  return w.currency || 'INR';
}

const METHOD_TABS: { value: PaymentMethod | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'remaining_desc', label: 'Open: high to low' },
  { value: 'remaining_asc', label: 'Open: low to high' },
];

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-secondary hover:bg-secondary/10"
    >
      <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function DetailRow({ label, value, copy }: { label: string; value?: string; copy?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 text-sm">
      <span className="shrink-0 text-on-surface-variant">{label}</span>
      <div className="flex min-w-0 items-center gap-1 text-right">
        <span className="break-all font-medium">{value}</span>
        {copy && <CopyBtn text={value} />}
      </div>
    </div>
  );
}

function PaymentDetailsPanel({ w, full = false }: { w: AvailableWithdrawal; full?: boolean }) {
  const meta = METHOD_META[w.method];
  return (
    <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/80 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${meta.color}`}>
          <span className="material-symbols-outlined text-base">{meta.icon}</span>
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide">{meta.label} Payment Details</p>
          <p className="font-mono text-[10px] text-on-surface-variant">{w.referenceId}</p>
        </div>
      </div>

      <div className="divide-y divide-outline-variant/50">
        {w.method === 'upi' && w.upiDetails && (
          <>
            <DetailRow label="UPI ID" value={w.upiDetails.upiId} copy={full} />
            <DetailRow label="Name" value={w.upiDetails.payerName} />
          </>
        )}
        {w.method === 'bank' && w.bankDetails && (
          <>
            <DetailRow
              label="Account No."
              value={full ? w.bankDetails.accountNumber : maskAccount(w.bankDetails.accountNumber)}
              copy={full && !!w.bankDetails.accountNumber}
            />
            <DetailRow label="IFSC" value={w.bankDetails.ifscCode} copy={full} />
            <DetailRow label="Holder" value={w.bankDetails.accountHolderName} />
            <DetailRow label="Bank" value={w.bankDetails.bankName} />
          </>
        )}
        {w.method === 'usdt' && w.usdtDetails && (
          <>
            <DetailRow label="Network" value={w.usdtDetails.network || 'TRC20'} />
            <DetailRow label="Wallet address" value={w.usdtDetails.walletAddress} copy={full} />
            {full && w.usdtDetails.walletAddress ? (
              <div className="pt-2">
                <AddressQr
                  value={w.usdtDetails.walletAddress}
                  label={`Scan ${w.usdtDetails.network || 'TRC20'} address`}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function maskAccount(num?: string) {
  if (!num || num.length < 4) return '****';
  return `${'*'.repeat(num.length - 4)}${num.slice(-4)}`;
}

function MiniProgress({
  total,
  confirmed,
  locked,
  remaining,
}: {
  total: number;
  confirmed: number;
  locked: number;
  remaining: number;
}) {
  const confirmedPct = total > 0 ? (confirmed / total) * 100 : 0;
  const lockedPct = total > 0 ? (locked / total) * 100 : 0;
  const openPct = total > 0 ? (remaining / total) * 100 : 0;
  return (
    <div className="flex h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
      {confirmedPct > 0 && <div className="bg-emerald-500" style={{ width: `${confirmedPct}%` }} />}
      {lockedPct > 0 && <div className="bg-amber-500" style={{ width: `${lockedPct}%` }} />}
      {openPct > 0 && <div className="bg-secondary" style={{ width: `${openPct}%` }} />}
    </div>
  );
}

export function InvestWithdrawalsList() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [target, setTarget] = useState<AvailableWithdrawal | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [proofKey, setProofKey] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [formError, setFormError] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, search, sort, method }),
    [page, limit, search, sort, method],
  );

  const payAmountNum = Number(payAmount);
  const { data: creditPreview, isFetching: previewLoading } = useQuery({
    queryKey: ['invest-credit-preview', target?._id, payAmountNum],
    queryFn: () => fulfillApi.previewCredit(payAmountNum, target!._id),
    enabled: !!target && Number.isFinite(payAmountNum) && payAmountNum >= 1,
    placeholderData: (prev) => prev,
  });

  const { data: portfolio, isLoading: loadingPortfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => investorApi.getPortfolio(),
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['invest-withdrawals', listQuery],
    queryFn: () => fulfillApi.getAvailable(listQuery),
  });

  const submit = useMutation({
    mutationFn: () =>
      fulfillApi.submitPayment(target!._id, {
        amount: Number(payAmount),
        utr: utr.trim(),
        proofImageKey: proofKey,
        proofImageUrl: proofUrl,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invest-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      setTarget(null);
      resetForm();
    },
    onError: (err: unknown) => {
      setFormError(apiErrorMessage(err, 'Submission failed. Please check your details.'));
    },
  });

  const resetForm = () => {
    setPayAmount('');
    setUtr('');
    setProofKey('');
    setProofUrl('');
    setFormError('');
  };

  const openPay = (w: AvailableWithdrawal) => {
    setTarget(w);
    resetForm();
    const maxPay =
      w.maxPayable != null ? Math.min(w.maxPayable, w.remainingAmount) : w.remainingAmount;
    setPayAmount(String(maxPay > 0 ? maxPay : w.remainingAmount));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const num = Number(payAmount);
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
          ? `Max payable is ${formatCurrency(maxPay, moneyCurrency(target))} (business limit remaining ₹${target.p2pPayRemainingInr})`
          : `Maximum remaining amount is ${formatCurrency(maxPay, moneyCurrency(target))}`,
      );
      return;
    }
    if (!utr || utr.length < 6) {
      setFormError(
        moneyCurrency(target) === 'USDT'
          ? 'TxID / TRX hash is required'
          : 'UTR is required',
      );
      return;
    }
    if (!proofKey || !proofUrl) {
      setFormError('Please upload a payment screenshot');
      return;
    }
    submit.mutate();
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  if (loadingPortfolio) return <LoadingScreen />;

  const stats = [
    { label: 'Balance', value: formatCurrency(portfolio?.balance ?? 0), accent: 'text-secondary' },
    {
      label: 'Locked Pts',
      value: formatCurrency(portfolio?.lockedBalance ?? 0),
      accent: 'text-amber-600',
    },
    {
      label: 'Invested',
      value: formatCurrency(portfolio?.totalInvested ?? 0),
      accent: '',
    },
    { label: 'Open Req', value: String(total), accent: 'text-secondary' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-2">
        {stats.map((s) => (
          <div key={s.label} className="px-1 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">
              {s.label}
            </p>
            <p className={`text-sm font-bold md:text-base ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Search"
              icon="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Reference, UPI, name…"
              className="py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Sort
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                  setPage(1);
                }}
                className="rounded-lg border border-outline-variant bg-surface-container-low px-2 py-2 text-xs font-medium"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Per page
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-outline-variant bg-surface-container-low px-2 py-2 text-xs font-medium"
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

        <div className="mt-2 flex flex-wrap gap-1">
          {METHOD_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setMethod(t.value);
                setPage(1);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                method === t.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant/50 px-3 py-2">
          <p className="text-xs font-semibold text-on-surface-variant">
            {total} request{total !== 1 ? 's' : ''}
            {search || method !== 'all' ? ' matching filters' : ''}
          </p>
          <p className="text-[10px] text-outline">
            {items.length} on this page
          </p>
        </div>

        {isLoading ? (
          <div className="p-6">
            <LoadingScreen />
          </div>
        ) : isError ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-on-surface">
              {apiErrorMessage(error, 'Could not load withdrawal requests')}
            </p>
            <Button type="button" className="mt-4" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <div className="p-6">
            <EmptyState
              message={
                search || method !== 'all'
                  ? 'No requests match your filters'
                  : 'No withdrawal requests available'
              }
              icon="payments"
            />
          </div>
        ) : (
          <>
            <ul className={`divide-y divide-outline-variant/40 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((w) => {
                const meta = METHOD_META[w.method];
                return (
                  <li
                    key={w._id}
                    className="group flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-surface-container-low/60 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.color}`}
                      >
                        <span className="material-symbols-outlined text-lg">{meta.icon}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-base font-bold">
                            {formatCurrency(w.amount, moneyCurrency(w))}
                          </span>
                          <StatusBadge status={w.status} />
                        </div>
                        <p className="truncate font-mono text-[10px] text-on-surface-variant">
                          {w.referenceId} · {formatDate(w.createdAt)}
                        </p>
                        <div className="mt-1.5 max-w-xs">
                          <MiniProgress
                            total={w.amount}
                            confirmed={w.paidAmount || 0}
                            locked={w.reservedAmount || 0}
                            remaining={w.remainingAmount}
                          />
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                            {(w.paidAmount || 0) > 0 && (
                              <span className="text-emerald-600">
                                Received {formatCurrency(w.paidAmount, moneyCurrency(w))}
                              </span>
                            )}
                            {(w.reservedAmount || 0) > 0 && (
                              <span className="text-amber-600">
                                Locked {formatCurrency(w.reservedAmount!, moneyCurrency(w))}
                              </span>
                            )}
                            <span className="text-secondary">
                              Open {formatCurrency(w.remainingAmount, moneyCurrency(w))}
                              {w.maxPayable != null &&
                              w.p2pPayRemainingInr != null &&
                              w.maxPayable < w.remainingAmount
                                ? ` · Pay up to ${formatCurrency(w.maxPayable, moneyCurrency(w))} (limit ₹${w.p2pPayRemainingInr})`
                                : ''}
                            </span>
                          </div>
                          {w.creditIfPayFull && w.remainingAmount > 0 && (
                            <p className="mt-1 text-[11px] font-semibold text-secondary">
                              You get{' '}
                              {formatCurrency(
                                w.creditIfPayFull.netCredited,
                                w.creditIfPayFull.creditCurrency || 'INR',
                              )}
                              {w.creditIfPayFull.bonusAmount > 0
                                ? ` (incl. +${formatCurrency(w.creditIfPayFull.bonusAmount, 'INR')} bonus)`
                                : ''}
                              {moneyCurrency(w) === 'USDT' && w.creditIfPayFull.exchangeRate
                                ? ` · @ ${w.creditIfPayFull.exchangeRate} INR/USDT`
                                : ''}{' '}
                              if you pay full open
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="shrink-0 self-end sm:self-center"
                      onClick={() => openPay(w)}
                      disabled={
                        w.remainingAmount <= 0 || (w.maxPayable != null && w.maxPayable <= 0)
                      }
                    >
                      Pay
                    </Button>
                  </li>
                );
              })}
            </ul>

            <div className="px-3 pb-2">
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
      </div>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Pay & Invest"
        className="sm:max-w-md"
        footer={
          target ? (
            <Button
              type="submit"
              form="invest-pay-form"
              className="w-full"
              loading={submit.isPending}
            >
              Submit Payment
            </Button>
          ) : null
        }
      >
        {target && (
          <form id="invest-pay-form" onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-gradient-to-r from-secondary-container/30 to-primary-container/20 p-2.5 text-center">
              <div>
                <p className="text-[10px] text-on-surface-variant">Total</p>
                <p className="text-sm font-bold">{formatCurrency(target.amount, moneyCurrency(target))}</p>
              </div>
              <div>
                <p className="text-[10px] text-amber-700">Locked</p>
                <p className="text-sm font-bold text-amber-700">
                  {formatCurrency(target.reservedAmount ?? 0, moneyCurrency(target))}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-secondary">Pay up to</p>
                <p className="text-sm font-bold text-secondary">
                  {formatCurrency(
                    target.maxPayable != null
                      ? Math.min(target.maxPayable, target.remainingAmount)
                      : target.remainingAmount,
                    moneyCurrency(target),
                  )}
                </p>
              </div>
            </div>

            {target.p2pPayRemainingInr != null && (
              <p className="text-[11px] text-amber-700">
                Business P2P limit remaining: ₹{target.p2pPayRemainingInr}
                {target.maxPayable != null && target.maxPayable < target.remainingAmount
                  ? ` · capped from open ${formatCurrency(target.remainingAmount, moneyCurrency(target))}`
                  : ''}
              </p>
            )}

            <PaymentDetailsPanel w={target} full />

            <p className="text-[11px] text-on-surface-variant">
              {moneyCurrency(target) === 'USDT'
                ? 'Send USDT to the address / QR above, then enter amount, TxID, and upload proof.'
                : 'Pay to the account details above, then enter the amount, UTR, and upload proof below.'}
            </p>

            <Input
              label={
                moneyCurrency(target) === 'USDT'
                  ? 'Payment amount (USDT)'
                  : 'Payment amount (₹)'
              }
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
            />

            {payAmountNum >= 1 && (
              <div
                className={`rounded-xl border border-secondary/25 bg-secondary-container/15 p-3 text-sm ${
                  previewLoading ? 'opacity-70' : ''
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-secondary">
                  After verification you get
                </p>
                {creditPreview ? (
                  <div className="mt-2 space-y-1 text-on-surface-variant">
                    <p>
                      You pay{' '}
                      <span className="font-semibold text-on-surface">
                        {formatCurrency(creditPreview.payAmount, moneyCurrency(target))}
                      </span>
                      {moneyCurrency(target) === 'USDT' && creditPreview.payAmountInr != null && (
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
                        Investor bonus{' '}
                        <span className="font-semibold text-secondary">
                          +{formatCurrency(creditPreview.bonusAmount, 'INR')}
                        </span>
                      </p>
                    )}
                    <p className="border-t border-outline-variant/60 pt-2 text-base font-bold text-secondary">
                      Wallet credit (INR points){' '}
                      {formatCurrency(
                        creditPreview.netCredited,
                        creditPreview.creditCurrency || 'INR',
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-on-surface-variant">Calculating…</p>
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
              disabled={submit.isPending}
              referenceKind={moneyCurrency(target) === 'USDT' ? 'txid' : 'utr'}
            />

            {formError && (
              <div className="rounded-lg bg-error-container px-3 py-2 text-xs text-on-error-container">
                {formError}
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
