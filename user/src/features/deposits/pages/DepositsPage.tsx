'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { depositsApi } from '../api/deposits.api';
import { paymentConfigApi } from '@/features/payments/api/payment-config.api';
import { Modal } from '@/shared/components/ui/Modal';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast/toast.store';
import { confirmDialog } from '@/shared/ui/confirm/confirm.store';
import {
  AvailableWithdrawalsPanel,
  MyP2pPaymentsPanel,
} from '../components/AvailableWithdrawalsPanel';
import type { CreateDepositPayload, PaymentMethod } from '@/shared/types/api.types';

const METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'upi', label: 'UPI', icon: 'qr_code' },
  { value: 'bank', label: 'Bank', icon: 'account_balance' },
  { value: 'usdt', label: 'USDT', icon: 'currency_bitcoin' },
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

function depositErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) return msg.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Failed to create deposit. Check amount and details.';
}

function DepositsPageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'pay' | 'deposits' | 'payments'>('pay');
  const [preferredPayAmount, setPreferredPayAmount] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [payerName, setPayerName] = useState('');
  const [utr, setUtr] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [txHash, setTxHash] = useState('');
  const [network, setNetwork] = useState('TRC20');
  const [formError, setFormError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'pay' || tabParam === 'deposits' || tabParam === 'payments') {
      setTab(tabParam);
    }
    const amountParam = Number(searchParams.get('payAmount'));
    if (Number.isFinite(amountParam) && amountParam >= 1) {
      setPreferredPayAmount(amountParam);
      setTab('pay');
    }
  }, [searchParams]);

  const listQuery = useMemo(
    () => ({ page, limit, status, search, sort }),
    [page, limit, status, search, sort],
  );

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['deposit-detail', selectedId],
    queryFn: () => depositsApi.getById(selectedId!),
    enabled: !!selectedId,
  });

  const { data: configs } = useQuery({
    queryKey: ['payment-config-active'],
    queryFn: () => paymentConfigApi.getActive(),
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['deposits', listQuery],
    queryFn: () => depositsApi.getMy(listQuery),
  });

  const activeConfig = configs?.find((c) => c.method === method);

  const create = useMutation({
    mutationFn: (payload: CreateDepositPayload) => depositsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      setShowForm(false);
      resetForm();
      toast.success('Deposit submitted', 'Waiting for confirmation.');
    },
    onError: (err) => {
      const msg = depositErrorMessage(err);
      setFormError(msg);
      toast.error('Deposit failed', msg);
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => depositsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deposits'] });
      toast.success('Deposit cancelled');
    },
    onError: (err) => toast.error('Cancel failed', depositErrorMessage(err)),
  });

  const resetForm = () => {
    setAmount('');
    setUpiId('');
    setPayerName('');
    setUtr('');
    setAccountNumber('');
    setIfscCode('');
    setAccountHolderName('');
    setWalletAddress('');
    setTxHash('');
    setFormError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 1) {
      setFormError('Enter a valid amount');
      return;
    }

    const payload: CreateDepositPayload = { amount: numAmount, method };

    if (method === 'upi') {
      if (!upiId) {
        setFormError('UPI ID is required');
        return;
      }
      payload.upiDetails = { upiId, payerName: payerName || undefined, utr: utr || undefined };
    } else if (method === 'bank') {
      if (!accountNumber || !ifscCode || !accountHolderName) {
        setFormError('Bank details are required');
        return;
      }
      payload.bankDetails = { accountNumber, ifscCode, accountHolderName, utr: utr || undefined };
    } else {
      if (!walletAddress) {
        setFormError('Wallet address is required');
        return;
      }
      payload.usdtDetails = { walletAddress, network, txHash: txHash || undefined };
      payload.currency = 'USDT';
    }

    create.mutate(payload);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
            Deposits
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Pay open withdrawal requests to deposit, or submit your own deposit request
          </p>
        </div>
        {tab === 'deposits' && (
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setShowForm((v) => !v);
              setFormError('');
            }}
          >
            {showForm ? 'Close form' : 'New deposit'}
          </Button>
        )}
      </div>

      <div className="chip-scroll">
        {(
          [
            { id: 'pay' as const, label: 'Pay requests' },
            { id: 'deposits' as const, label: 'My deposits' },
            { id: 'payments' as const, label: 'My payments' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm ${
              tab === t.id
                ? 'bg-primary text-on-primary'
                : 'border border-outline-variant bg-surface-container-lowest'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pay' && (
        <>
          <p className="rounded-xl border border-outline-variant/80 bg-surface-container-low/60 px-3 py-2.5 text-xs text-on-surface-variant sm:text-sm">
            Only withdrawals approved by the business or admin appear here. Pay any listed request —
            you do not need someone else to have funds first.
          </p>
          <AvailableWithdrawalsPanel preferredAmount={preferredPayAmount} />
        </>
      )}
      {tab === 'payments' && <MyP2pPaymentsPanel />}
      {tab === 'deposits' && (
        <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Total
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{total}</p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">Matching filters</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Page
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{items.length}</p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">Current page</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
            Pending
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">
            {items.filter((d) => d.status === 'pending' || d.status === 'processing').length}
          </p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">On this page</p>
        </div>
      </div>

      {showForm && (
        <Card title="Create deposit">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="chip-scroll">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                    method === m.value
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>

            {activeConfig && (
              <div className="rounded-xl bg-secondary-container/20 p-4 text-sm">
                <p className="font-semibold text-on-secondary-container">Pay to: {activeConfig.label}</p>
                <p className="mt-1 text-on-surface-variant">
                  Min {formatCurrency(activeConfig.minAmount, activeConfig.currency)} — Max{' '}
                  {formatCurrency(activeConfig.maxAmount, activeConfig.currency)}
                </p>
                <dl className="mt-2 space-y-1">
                  {Object.entries(activeConfig.details).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="capitalize text-on-surface-variant">{k.replace(/([A-Z])/g, ' $1')}</dt>
                      <dd className="font-mono text-right text-xs">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <Input
              label="Amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />

            {method === 'upi' && (
              <>
                <Input label="Your UPI ID" value={upiId} onChange={(e) => setUpiId(e.target.value)} required />
                <Input label="Payer name (optional)" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
                <Input label="UTR / reference (optional)" value={utr} onChange={(e) => setUtr(e.target.value)} />
              </>
            )}

            {method === 'bank' && (
              <>
                <Input
                  label="Account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                />
                <Input label="IFSC code" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} required />
                <Input
                  label="Account holder name"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  required
                />
                <Input label="UTR (optional)" value={utr} onChange={(e) => setUtr(e.target.value)} />
              </>
            )}

            {method === 'usdt' && (
              <>
                <Input
                  label="Your wallet address"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  required
                />
                <Input label="Network" value={network} onChange={(e) => setNetwork(e.target.value)} />
                <Input label="Tx hash (optional)" value={txHash} onChange={(e) => setTxHash(e.target.value)} />
              </>
            )}

            {formError && (
              <div className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
                {formError}
              </div>
            )}

            <Button type="submit" loading={create.isPending} className="w-full sm:w-auto">
              Submit deposit request
            </Button>
          </form>
        </Card>
      )}

      <Card title="My deposits">
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
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:w-[280px]">
              <label className="flex flex-col gap-1 text-xs font-semibold sm:text-sm">
                Sort
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:text-sm">
                Per page
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm font-normal focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5"
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
              {depositErrorMessage(error) || 'Could not load deposits'}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all'
                ? 'No deposits match your filters'
                : 'No deposits yet'
            }
            icon="south_west"
          />
        ) : (
          <>
            <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((d) => (
                <div
                  key={d._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant p-3 sm:gap-3 sm:rounded-xl sm:p-4"
                >
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(d._id)}>
                    <p className="text-sm font-semibold sm:text-base">{formatCurrency(d.amount, d.currency)}</p>
                    <p className="mt-0.5 break-all text-[11px] text-on-surface-variant sm:text-xs">
                      {d.referenceId} · {d.method.toUpperCase()} · {formatDate(d.createdAt)}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <StatusBadge status={d.status} />
                    {d.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={cancel.isPending}
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: 'Cancel deposit?',
                            description: `Cancel ${d.referenceId} for ${formatCurrency(d.amount, d.currency)}?`,
                            confirmLabel: 'Yes, cancel',
                            cancelLabel: 'Keep request',
                            variant: 'danger',
                          });
                          if (ok) cancel.mutate(d._id);
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
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

      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title="Deposit details">
        {detailLoading ? (
          <LoadingScreen />
        ) : detail ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-on-surface-variant">Reference:</span> {detail.referenceId}
            </p>
            <p>
              <span className="text-on-surface-variant">Amount:</span>{' '}
              {formatCurrency(detail.amount, detail.currency)}
            </p>
            <p>
              <span className="text-on-surface-variant">Method:</span> {detail.method.toUpperCase()}
            </p>
            <StatusBadge status={detail.status} />
            <p className="text-on-surface-variant">Created: {formatDate(detail.createdAt)}</p>
          </div>
        ) : null}
      </Modal>
        </>
      )}
    </div>
  );
}

export function DepositsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DepositsPageInner />
    </Suspense>
  );
}
