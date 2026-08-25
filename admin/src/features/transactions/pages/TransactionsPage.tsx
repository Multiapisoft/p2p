'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Pagination } from '@/shared/components/ui/Pagination';
import { cn } from '@/shared/lib/utils';
import { fetchAllPages, personCsvCells } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { LedgerEntry } from '@/shared/types/api.types';
import {
  StatementCards,
  StatementTable,
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
  { value: 'credit', label: 'Credit' },
  { value: 'debit', label: 'Debit' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [10, 20, 50];

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [userIdInput, setUserIdInput] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setUserId(userIdInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, userIdInput]);

  const listQuery = useMemo(
    () => ({ page, limit, type, sort, search, userId }),
    [page, limit, type, sort, search, userId],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', listQuery],
    queryFn: () => transactionsApi.getAll(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Platform ledger
          </p>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
            Combined statement
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Credit / debit running balance for every wallet entry
          </p>
        </div>
        <CsvDownloadButton<LedgerEntry>
          title="Transaction ledger"
          filename={`ledger-${type}`}
          filters={{ Type: type, Search: search, User: userId, Sort: sort }}
          disabled={!total}
          columns={[
            { header: 'Type', value: (t) => t.type },
            { header: 'Direction', value: (t) => t.direction || '' },
            { header: 'Amount', value: (t) => t.amount },
            { header: 'Balance', value: (t) => t.balanceAfter },
            { header: 'Currency', value: (t) => t.currency },
            { header: 'Paid by', value: (t) => t.fromParty || '' },
            { header: 'Received by', value: (t) => t.toParty || '' },
            { header: 'Wallet owner', value: (t) => personCsvCells(t.userId)[0] },
            { header: 'Description', value: (t) => t.description || '' },
            { header: 'Created', value: (t) => t.createdAt },
          ]}
          fetchRows={() =>
            fetchAllPages((p, l) => transactionsApi.getAll({ ...listQuery, page: p, limit: l }))
          }
        />
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search remark, reference, parties…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Input
              className="min-w-0 flex-1 sm:min-w-[160px]"
              placeholder="Wallet owner ID"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
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
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
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
          <p className="text-xs text-on-surface-variant">
            {total} entr{total === 1 ? 'y' : 'ies'}
            {isFetching ? ' · refreshing…' : ''}
          </p>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No ledger entries match your filters" icon="receipt_long" />
        ) : (
          <div className={isFetching ? 'opacity-70' : ''}>
            <div className="hidden md:block">
              <StatementTable items={items} page={page} limit={limit} showOwner />
            </div>
            <StatementCards items={items} page={page} limit={limit} />
            <div className="mt-4">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
