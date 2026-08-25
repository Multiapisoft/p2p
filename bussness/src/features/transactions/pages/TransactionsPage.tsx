'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { getApiErrorMessage } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Modal } from '@/shared/components/ui/Modal';
import { cn, formatCurrency, formatDate } from '@/shared/lib/utils';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import { fetchAllPages } from '@/shared/lib/csv';
import type { LedgerEntry } from '@/shared/types/api.types';
import {
  StatementCards,
  StatementTable,
  isCreditEntry,
  typeMeta,
} from '../components/ledger-ui';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'commission', label: 'Commission' },
  { value: 'investment', label: 'Investment' },
  { value: 'redemption', label: 'Redemption' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'p2p_limit', label: 'Pay limit' },
  { value: 'lock', label: 'Lock' },
  { value: 'unlock', label: 'Unlock' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [10, 20, 50];

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-outline-variant/40 py-2 text-sm">
      <span className="shrink-0 text-on-surface-variant">{label}</span>
      <span className="text-right font-medium break-all">{value}</span>
    </div>
  );
}

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, type, sort, search }),
    [page, limit, type, sort, search],
  );

  const { data: balance } = useQuery({
    queryKey: ['business-wallet'],
    queryFn: () => walletApi.getBalance(),
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['transactions', listQuery],
    queryFn: () => transactionsApi.getMy(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const available =
    balance?.availableBalance ?? balance?.balance ?? balance?.redeemableAmount ?? 0;
  const currency = balance?.currency || items[0]?.currency || 'INR';

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Business statement
          </p>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
            Combined cashout ledger
          </h1>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
            {formatCurrency(available, currency)}
          </p>
        </div>
          <CsvDownloadButton<LedgerEntry>
            title="Business ledger"
            filename="business-ledger"
            filters={{ Type: type, Search: search, Sort: sort }}
            disabled={!total}
            columns={[
              { header: 'Type', value: (t) => t.type },
              { header: 'Direction', value: (t) => t.direction },
              { header: 'Amount', value: (t) => t.amount },
              { header: 'Balance', value: (t) => t.balanceAfter ?? '' },
              { header: 'Currency', value: (t) => t.currency },
              { header: 'Description', value: (t) => t.description },
              { header: 'Created', value: (t) => t.createdAt },
            ]}
            fetchRows={() =>
              fetchAllPages((page, limit) => transactionsApi.getMy({ ...listQuery, page, limit }))
            }
          />
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search remark, reference…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
          <div className="chip-scroll">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setType(t.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold',
                  type === t.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium">
              {getApiErrorMessage(error, 'Could not load transactions')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || type !== 'all' ? 'No transactions match your filters' : 'No transactions'
            }
            icon="receipt_long"
          />
        ) : (
          <div className={isFetching ? 'opacity-70' : ''}>
            <div className="hidden md:block">
              <StatementTable
                items={items}
                page={page}
                limit={limit}
                onRowClick={setSelected}
              />
            </div>
            <StatementCards
              items={items}
              page={page}
              limit={limit}
              onRowClick={setSelected}
            />
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
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Ledger entry"
        className="sm:max-w-lg"
      >
        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-1 text-xs font-semibold capitalize">
                <span className="material-symbols-outlined text-sm text-secondary">
                  {typeMeta(selected.type).icon}
                </span>
                {typeMeta(selected.type).label}
              </span>
              <span
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm font-bold',
                  isCreditEntry(selected)
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-700',
                )}
              >
                {isCreditEntry(selected) ? '+' : '−'}
                {formatCurrency(selected.amount, selected.currency)}
              </span>
            </div>
            {(selected.fromParty || selected.toParty) && (
              <p className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
                {[selected.fromParty || '—', selected.toParty || '—'].join(' → ')}
              </p>
            )}
            <div className="rounded-xl border border-outline-variant px-3">
              <DetailRow
                label="Balance before"
                value={formatCurrency(selected.balanceBefore, selected.currency)}
              />
              <DetailRow
                label="Balance after"
                value={formatCurrency(selected.balanceAfter, selected.currency)}
              />
              <DetailRow label="Reference" value={selected.referenceId || '—'} />
              <DetailRow label="Description" value={selected.description || '—'} />
              <DetailRow label="Date" value={formatDate(selected.createdAt)} />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
