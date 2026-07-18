'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '../api/transactions.api';
import { getApiErrorMessage } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Modal } from '@/shared/components/ui/Modal';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import type { LedgerEntry } from '@/shared/types/api.types';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'commission', label: 'Commission' },
  { value: 'investment', label: 'Investment' },
  { value: 'redemption', label: 'Redemption' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'lock', label: 'Lock' },
  { value: 'unlock', label: 'Unlock' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'status', label: 'Type' },
];

const PAGE_SIZES = [5, 10, 20];

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

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['transactions', listQuery],
    queryFn: () => transactionsApi.getMy(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Transaction Ledger"
        description="Your partner float wallet activity — deposits lock, withdrawals credit"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Total results
          </p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            On this page
          </p>
          <p className="mt-1 text-2xl font-bold">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Net on page
          </p>
          <p className="mt-1 text-2xl font-bold">
            {formatCurrency(
              items.reduce((sum, t) => sum + t.amount, 0),
              items[0]?.currency,
            )}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search reference, description…"
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

          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setType(t.value);
                  setPage(1);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
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
        ) : isError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
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
          <>
            <div className={`overflow-x-auto ${isFetching ? 'opacity-70' : ''}`}>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-outline-variant">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Type</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Amount</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Balance</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Reference</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Description</th>
                    <th className="pb-3 font-semibold text-on-surface-variant">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr
                      key={t._id}
                      className="cursor-pointer border-b border-outline-variant/50 hover:bg-surface-container-low/60"
                      onClick={() => setSelected(t)}
                    >
                      <td className="py-3 pr-4 capitalize">{t.type}</td>
                      <td className="py-3 pr-4 font-semibold">
                        {formatCurrency(t.amount, t.currency)}
                      </td>
                      <td className="py-3 pr-4 text-xs text-on-surface-variant">
                        {formatCurrency(t.balanceBefore, t.currency)} →{' '}
                        {formatCurrency(t.balanceAfter, t.currency)}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-xs text-on-surface-variant">{t.referenceType}</p>
                        <p className="max-w-[140px] truncate font-mono text-xs">{t.referenceId}</p>
                      </td>
                      <td className="max-w-[180px] truncate py-3 pr-4 text-on-surface-variant">
                        {t.description || '—'}
                      </td>
                      <td className="py-3 text-on-surface-variant">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Ledger entry"
        className="sm:max-w-lg"
      >
        {selected && (
          <div className="space-y-1">
            <DetailRow label="Type" value={<span className="capitalize">{selected.type}</span>} />
            <DetailRow
              label="Amount"
              value={formatCurrency(selected.amount, selected.currency)}
            />
            <DetailRow
              label="Balance before"
              value={formatCurrency(selected.balanceBefore, selected.currency)}
            />
            <DetailRow
              label="Balance after"
              value={formatCurrency(selected.balanceAfter, selected.currency)}
            />
            <DetailRow label="Reference type" value={selected.referenceType || '—'} />
            <DetailRow label="Reference ID" value={selected.referenceId || '—'} />
            <DetailRow label="Description" value={selected.description || '—'} />
            <DetailRow label="Date" value={formatDate(selected.createdAt)} />
            <DetailRow label="Entry ID" value={selected._id} />
          </div>
        )}
      </Modal>
    </div>
  );
}
