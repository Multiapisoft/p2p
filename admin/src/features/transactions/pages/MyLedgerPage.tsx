'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { walletApi } from '@/features/wallet/api/wallet.api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Pagination } from '@/shared/components/ui/Pagination';
import { formatCurrency } from '@/shared/lib/utils';
import { fetchAllPages } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { LedgerEntry } from '@/shared/types/api.types';
import {
  StatementCards,
  StatementTable,
  isCreditEntry,
} from '../components/ledger-ui';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'commission', label: 'Commission' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'adjustment', label: 'Adjustment' },
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

function summarize(items: LedgerEntry[]) {
  let inflow = 0;
  let outflow = 0;
  let commissionIn = 0;
  let investorBonusOut = 0;
  for (const t of items) {
    const credit = isCreditEntry(t);
    if (credit) inflow += t.amount || 0;
    else outflow += t.amount || 0;
    const flow = (t.flow || '').toLowerCase();
    const desc = (t.description || '').toLowerCase();
    if (credit && (t.type === 'commission' || desc.includes('fee'))) {
      commissionIn += t.amount || 0;
    }
    if (
      !credit &&
      (flow.includes('investor') ||
        desc.includes('investor') ||
        desc.includes('bonus') ||
        desc.includes('referral'))
    ) {
      investorBonusOut += t.amount || 0;
    }
  }
  return { inflow, outflow, commissionIn, investorBonusOut };
}

export function MyLedgerPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

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

  const { data: platform } = useQuery({
    queryKey: ['platform-wallet'],
    queryFn: () => walletApi.getPlatform(),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['my-ledger', listQuery],
    queryFn: () => transactionsApi.getMine(listQuery),
  });

  const { data: summaryRows } = useQuery({
    queryKey: ['my-ledger-summary', type, search],
    queryFn: () =>
      fetchAllPages((p, l) =>
        transactionsApi.getMine({ page: p, limit: l, type, search, sort: 'newest' }),
      ),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const summary = useMemo(() => summarize(summaryRows ?? []), [summaryRows]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            My Ledger
          </p>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
            Admin commission wallet
          </h1>
        </div>
        <CsvDownloadButton<LedgerEntry>
          title="My ledger"
          filename={`my-ledger-${type}`}
          filters={{ Type: type, Search: search, Sort: sort }}
          disabled={!total}
          columns={[
            { header: 'Type', value: (t) => t.type },
            { header: 'Direction', value: (t) => t.direction || '' },
            { header: 'Amount', value: (t) => t.amount },
            { header: 'Balance', value: (t) => t.balanceAfter },
            { header: 'Currency', value: (t) => t.currency },
            { header: 'From', value: (t) => t.fromParty || '' },
            { header: 'To', value: (t) => t.toParty || '' },
            { header: 'Description', value: (t) => t.description || '' },
            { header: 'Created', value: (t) => t.createdAt },
          ]}
          fetchRows={() =>
            fetchAllPages((p, l) => transactionsApi.getMine({ ...listQuery, page: p, limit: l }))
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <Card className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Balance
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {formatCurrency(platform?.wallet?.balance ?? 0)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Total in
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
            {formatCurrency(summary.inflow)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Total out
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-red-700">
            {formatCurrency(summary.outflow)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Fees in
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {formatCurrency(summary.commissionIn)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Investor bonus out
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {formatCurrency(summary.investorBonusOut)}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  type === t.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : items.length === 0 ? (
          <EmptyState message="No ledger entries" icon="menu_book" />
        ) : (
          <>
            <div className={isFetching ? 'opacity-60' : ''}>
              <div className="hidden md:block">
                <StatementTable items={items} page={page} limit={limit} />
              </div>
              <StatementCards items={items} page={page} limit={limit} />
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
