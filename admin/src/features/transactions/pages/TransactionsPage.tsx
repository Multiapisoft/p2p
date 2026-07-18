'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { Pagination } from '@/shared/components/ui/Pagination';
import { formatCurrency, formatDate } from '@/shared/lib/utils';

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'commission', label: 'Commission' },
  { value: 'investment', label: 'Investment' },
  { value: 'redemption', label: 'Redemption' },
  { value: 'adjustment', label: 'Adjustment' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [5, 10, 20];

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
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
          Transaction Ledger
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">Platform-wide wallet ledger entries</p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total results
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{total}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            On this page
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{items.length}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Adjustments
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">
            {items.filter((t) => t.type === 'adjustment').length}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[180px]"
              placeholder="Search reference, notes…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Input
              className="min-w-0 flex-1 sm:min-w-[160px]"
              placeholder="User ID (optional)"
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
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm ${
                  type === t.value ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No ledger entries match your filters" icon="receipt_long" />
        ) : (
          <div className={isFetching ? 'opacity-70' : ''}>
            <div className="space-y-2 md:hidden">
              {items.map((t) => (
                <div key={t._id} className="rounded-lg border border-outline-variant p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold capitalize">{t.type}</p>
                    <p className="text-sm font-bold">{formatCurrency(t.amount, t.currency)}</p>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {formatCurrency(t.balanceBefore, t.currency)} →{' '}
                    {formatCurrency(t.balanceAfter, t.currency)}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-on-surface-variant">
                    {t.referenceType} · {t.referenceId}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">{formatDate(t.createdAt)}</p>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto custom-scrollbar md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-outline-variant bg-surface-container-low">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Type</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Amount</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Balance</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Reference</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {items.map((t) => (
                    <tr key={t._id} className="hover:bg-surface-container-low">
                      <td className="px-3 py-2.5 capitalize sm:px-4 sm:py-3">{t.type}</td>
                      <td className="px-3 py-2.5 font-semibold sm:px-4 sm:py-3">
                        {formatCurrency(t.amount, t.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-on-surface-variant sm:px-4 sm:py-3">
                        {formatCurrency(t.balanceBefore, t.currency)} →{' '}
                        {formatCurrency(t.balanceAfter, t.currency)}
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <p className="text-xs text-on-surface-variant">{t.referenceType}</p>
                        <p className="truncate font-mono text-xs">{t.referenceId}</p>
                      </td>
                      <td className="px-3 py-2.5 text-on-surface-variant sm:px-4 sm:py-3">
                        {formatDate(t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
