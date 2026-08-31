'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { normalizeUtr, normalizeTxHash, paymentRefErrorForMethod } from '@/shared/lib/validation';
import { buildUpiPayUri, buildUpiAppLinks, formatSecondsMmSs } from '@/shared/lib/upi-qr';
import { minPartialAmount, partialPayError } from '@/shared/lib/partial-pay';
import { InvestorLimitPanel } from '@/features/invest/components/InvestorLimitPanel';
import { InvestAmountModal } from '@/features/invest/components/InvestAmountModal';
import { apiGet } from '@/shared/api/client';
import type { PaymentMethod } from '@/shared/types/api.types';
import { liveQueryOptions } from '@/shared/constants/live-query';

const MATCH_AMOUNT_KEY = 'p2p-match-amount';
const PAGE_SIZES = [5, 10, 20];

function readStoredMatchAmount() {
  if (typeof window === 'undefined') return null;
  const n = Number(sessionStorage.getItem(MATCH_AMOUNT_KEY));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function notifyMatchReady(amount: number) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  const title = 'Investment match ready';
  const body = `Withdrawal available for ₹${amount.toLocaleString('en-IN')}. Open Invest to pay.`;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: 'invest-deposit-match' });
    } catch {
      /* ignore */
    }
  }
}

type SortKey = 'amount_desc' | 'amount_asc' | 'remaining_desc' | 'remaining_asc' | 'newest' | 'oldest';

const METHOD_META: Record<PaymentMethod, { label: string; icon: string; color: string }> = {
  upi: { label: 'UPI', icon: 'qr_code_2', color: 'text-blue-600 bg-blue-500/10' },
  bank: { label: 'Bank', icon: 'account_balance', color: 'text-violet-600 bg-violet-500/10' },
  usdt: { label: 'USDT', icon: 'currency_bitcoin', color: 'text-orange-600 bg-orange-500/10' },
  cdm: { label: 'CDM', icon: 'atm', color: 'text-emerald-700 bg-emerald-500/10' },
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
  { value: 'cdm', label: 'CDM' },
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

function PaymentDetailsPanel({
  w,
  full = false,
  payAmount,
}: {
  w: AvailableWithdrawal;
  full?: boolean;
  payAmount?: number;
}) {
  const meta = METHOD_META[w.method];
  const upiAmount =
    payAmount != null && payAmount > 0
      ? payAmount
      : w.maxPayable != null
        ? Math.min(w.maxPayable, w.remainingAmount)
        : w.remainingAmount;
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
            {full && w.upiDetails.upiId ? (
              <div className="pt-2">
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
              </div>
            ) : null}
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
  const [claimPayDeadline, setClaimPayDeadline] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [proofKey, setProofKey] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [matchAmount, setMatchAmount] = useState<number | null>(null);
  const [matchInput, setMatchInput] = useState(() => {
    const stored = readStoredMatchAmount();
    return stored != null ? String(stored) : '';
  });
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [matchReadyOpen, setMatchReadyOpen] = useState(false);
  const wasWaitingRef = useRef(false);
  const qc = useQueryClient();

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
    ...liveQueryOptions,
  });

  useEffect(() => {
    if (matchAmount == null || !data) return;
    const waiting = !!data.waitingForMatch || (data.items?.length ?? 0) === 0;
    const hasItems = (data.items?.length ?? 0) > 0;
    if (wasWaitingRef.current && hasItems) {
      setMatchReadyOpen(true);
      notifyMatchReady(matchAmount);
    }
    wasWaitingRef.current = waiting;
  }, [data, matchAmount]);

  const { data: platformSettings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () =>
      apiGet<{
        investorPlanAmounts?: number[];
        investorAllowedDepositMethods?: PaymentMethod[];
      }>('/platform-settings'),
  });

  const methodTabs = useMemo(() => {
    const allowed =
      platformSettings?.investorAllowedDepositMethods ?? data?.investorAllowedDepositMethods;
    if (!allowed?.length) return METHOD_TABS;
    return METHOD_TABS.filter((t) => t.value === 'all' || allowed.includes(t.value));
  }, [platformSettings?.investorAllowedDepositMethods, data?.investorAllowedDepositMethods]);

  const depositMethodsRestricted =
    (platformSettings?.investorAllowedDepositMethods ?? data?.investorAllowedDepositMethods)
      ?.length &&
    methodTabs.filter((t) => t.value !== 'all').length <
      METHOD_TABS.filter((t) => t.value !== 'all').length;

  useEffect(() => {
    if (!methodTabs.length) return;
    if (!methodTabs.some((t) => t.value === method)) {
      setMethod(methodTabs[0]?.value ?? 'all');
    }
  }, [methodTabs, method]);

  const addLimit = useMutation({
    mutationFn: (amount: number) => fulfillApi.addInvestorLimit(amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invest-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });

  const submit = useMutation({
    mutationFn: () =>
      fulfillApi.submitPayment(target!._id, {
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
      qc.invalidateQueries({ queryKey: ['invest-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      closePay();
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
          matchAmount != null && matchAmount >= 1 ? Math.min(matchAmount, maxPay) : maxPay;
        setPayAmount(String(pref > 0 ? pref : maxPay));
        return;
      }
      const claimed = await fulfillApi.claimWithdrawal(w._id);
      setTarget({ ...w, ...claimed });
      setClaimPayDeadline(claimed.claimPayDeadline);
      resetForm();
      const maxPay =
        claimed.maxPayable != null
          ? Math.min(claimed.maxPayable, claimed.remainingAmount)
          : claimed.remainingAmount;
      const pref =
        matchAmount != null && matchAmount >= 1 ? Math.min(matchAmount, maxPay) : maxPay;
      setPayAmount(String(pref > 0 ? pref : maxPay));
      qc.invalidateQueries({ queryKey: ['invest-withdrawals'] });
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
        setFormError('Please upload a payment screenshot');
        return;
      }
    }
    submit.mutate();
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const needsLimit = !!(data?.needsLimit ?? data?.needsPlan);
  const showBonus = true;
  const needsAmount = !needsLimit && (!matchAmount || !!data?.needsAmount);
  const limitLots = data?.lots ?? [];
  const limitRemaining = data?.limitRemaining ?? 0;
  const limitAdded = data?.limitAdded ?? 0;
  const claimLockMinutes = data?.claimLockMinutes ?? 7;
  const paySecondsLeft = claimPayDeadline
    ? Math.max(0, Math.ceil((new Date(claimPayDeadline).getTime() - now) / 1000))
    : 0;
  const payExpired =
    !target?.assignedToMe && !!claimPayDeadline && paySecondsLeft <= 0;

  const applyMatchAmount = (n: number) => {
    const cap = limitRemaining > 0 ? limitRemaining : null;
    const amount = cap != null ? Math.min(n, cap) : n;
    setMatchAmount(amount);
    setMatchInput(String(amount));
    setPage(1);
    setAmountModalOpen(false);
    sessionStorage.setItem(MATCH_AMOUNT_KEY, String(amount));
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  useEffect(() => {
    if (loadingPortfolio || !data) return;
    if (needsLimit) {
      setAmountModalOpen(false);
      return;
    }
    if (matchAmount == null) setAmountModalOpen(true);
  }, [loadingPortfolio, data, needsLimit, matchAmount]);

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
      <InvestAmountModal
        open={amountModalOpen}
        initialValue={matchInput}
        cap={limitRemaining > 0 ? limitRemaining : null}
        title="Enter invest amount"
        onClose={() => setAmountModalOpen(false)}
        onApply={applyMatchAmount}
      />
      <Modal
        open={matchReadyOpen}
        onClose={() => setMatchReadyOpen(false)}
        title="Withdrawal ready"
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">Match found.</p>
          <Button type="button" className="w-full" onClick={() => setMatchReadyOpen(false)}>
            View payment details
          </Button>
        </div>
      </Modal>
      {formError && !target && (
        <div className="rounded-lg bg-error-container px-3 py-2 text-xs text-on-error-container">
          {formError}
        </div>
      )}

      {data && !needsLimit && (
        <div className="rounded-xl border border-secondary/25 bg-secondary-container/15 p-3">
          <InvestorLimitPanel
            compact
            remaining={limitRemaining}
            added={limitAdded}
            lots={limitLots}
            planAmounts={platformSettings?.investorPlanAmounts}
            pending={addLimit.isPending}
            error={addLimit.error}
            onAdd={(amount) => addLimit.mutate(amount)}
          />
        </div>
      )}

      {!needsLimit && (
        <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                Amount to pay
              </p>
              <p className="text-lg font-bold text-secondary">
                {matchAmount != null ? formatCurrency(matchAmount) : 'Enter amount first'}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={matchAmount ? 'outline' : 'primary'}
              onClick={() => setAmountModalOpen(true)}
            >
              {matchAmount != null ? 'Change amount' : 'Enter amount'}
            </Button>
          </div>
        </div>
      )}

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
          {methodTabs.map((t) => (
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
        {depositMethodsRestricted ? (
          <p className="mt-2 text-xs text-on-surface-variant">
            Only admin-enabled deposit methods are shown (UPI / Bank / USDT / CDM).
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant/50 px-3 py-2">
          <p className="text-xs font-semibold text-on-surface-variant">
            {total} request{total !== 1 ? 's' : ''}
            {search || method !== 'all' ? ' matching filters' : ''}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
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
        ) : needsLimit ? (
          <div className="p-6">
            <EmptyState
              message="Add a pay-limit amount first to see available withdrawals."
              icon="payments"
            />
          </div>
        ) : needsAmount && !items.length ? (
          <div className="p-6">
            <EmptyState
              message="Enter amount first."
              icon="payments"
            />
          </div>
        ) : !items.length ? (
          <div className="p-6">
            <EmptyState message="No matches." icon="payments" />
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
                          {w.priority ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                              Highlighted
                            </span>
                          ) : null}
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
                              {showBonus && w.creditIfPayFull.bonusAmount > 0
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
                      loading={claimingId === w._id}
                      disabled={
                        w.remainingAmount <= 0 ||
                        (w.maxPayable != null && w.maxPayable <= 0) ||
                        claimingId === w._id
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
        open={needsLimit}
        onClose={() => undefined}
        title="Choose an Investment plan to unlock Earnings"
        className="sm:max-w-md"
      >
        <InvestorLimitPanel
          remaining={limitRemaining}
          added={limitAdded}
          lots={limitLots}
          firstLogin
          planAmounts={platformSettings?.investorPlanAmounts}
          pending={addLimit.isPending}
          error={addLimit.error}
          onAdd={(amount) => addLimit.mutate(amount)}
        />
      </Modal>

      <Modal
        open={!!target}
        onClose={closePay}
        title="Pay & Invest"
        className="sm:max-w-md"
        footer={
          target ? (
            <Button
              type="submit"
              form="invest-pay-form"
              className="w-full"
              loading={submit.isPending}
              disabled={payExpired}
            >
              {payExpired ? 'Time expired' : 'Submit Payment'}
            </Button>
          ) : null
        }
      >
        {target && (
          <form id="invest-pay-form" onSubmit={handleSubmit} className="space-y-3">
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
                Business Platform Payment limit remaining: ₹{target.p2pPayRemainingInr}
                {target.maxPayable != null && target.maxPayable < target.remainingAmount
                  ? ` · capped from open ${formatCurrency(target.remainingAmount, moneyCurrency(target))}`
                  : ''}
              </p>
            )}

            <PaymentDetailsPanel
              w={target}
              full
              payAmount={payAmountNum >= 1 ? payAmountNum : undefined}
            />

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
              disabled={payExpired}
            />
            {(() => {
              const maxPay =
                target.maxPayable != null
                  ? Math.min(target.maxPayable, target.remainingAmount)
                  : target.remainingAmount;
              const num = Number(payAmount);
              const isFullPay =
                Number.isFinite(num) && num >= 1 && num >= maxPay - 0.001;
              if (isFullPay) return null;
              return (
                <p className="text-[11px] text-on-surface-variant">
                  Min amount{' '}
                  {formatCurrency(
                    minPartialAmount(target.method, target.currency),
                    moneyCurrency(target),
                  )}
                  . Smaller leftover only as full pay.
                </p>
              );
            })()}

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
                  <div className="mt-2 space-y-1.5 text-on-surface-variant">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>You pay</span>
                      <span className="font-semibold text-on-surface">
                        {formatCurrency(creditPreview.payAmount, moneyCurrency(target))}
                      </span>
                    </p>
                    {moneyCurrency(target) === 'USDT' && creditPreview.payAmountInr != null && (
                      <p className="text-xs">
                        ≈ {formatCurrency(creditPreview.payAmountInr, 'INR')}
                        {creditPreview.exchangeRate ? ` @ ${creditPreview.exchangeRate}` : ''}
                      </p>
                    )}
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>Principal credit</span>
                      <span className="font-semibold text-on-surface">
                        {formatCurrency(
                          creditPreview.principalCredit,
                          creditPreview.creditCurrency || 'INR',
                        )}
                      </span>
                    </p>
                    {showBonus && (
                      <p className="flex flex-wrap items-baseline justify-between gap-2">
                        <span>
                          Investor bonus
                          {creditPreview.bonusPercentage != null &&
                          creditPreview.bonusPercentage > 0
                            ? ` (${creditPreview.bonusPercentage}%)`
                            : ''}
                        </span>
                        <span className="font-semibold text-secondary">
                          +
                          {formatCurrency(
                            creditPreview.bonusAmount || 0,
                            creditPreview.creditCurrency || 'INR',
                          )}
                        </span>
                      </p>
                    )}
                    <p className="flex flex-wrap items-baseline justify-between gap-2 border-t border-outline-variant/60 pt-2 text-base font-bold text-secondary">
                      <span>Total wallet credit</span>
                      <span>
                        {formatCurrency(
                          creditPreview.netCredited,
                          creditPreview.creditCurrency || 'INR',
                        )}
                      </span>
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
              disabled={submit.isPending || payExpired}
              referenceKind={moneyCurrency(target) === 'USDT' ? 'txid' : 'utr'}
              utrRequired={!target.assignedToMe}
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
