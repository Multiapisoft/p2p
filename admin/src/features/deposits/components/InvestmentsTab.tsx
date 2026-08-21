'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { investorsApi } from '@/features/investors/api/investors.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { fetchAllPages, personCsvCells } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { Investment } from '@/shared/types/api.types';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
];

const PAGE_SIZES = [5, 10, 20];

function personLabel(investorId: Investment['investorId']) {
  if (!investorId) return '—';
  if (typeof investorId === 'string') return investorId;
  const parts = [investorId.name, investorId.email, investorId.phone].filter(Boolean);
  return parts.length ? parts.join(' · ') : investorId._id;
}

export function InvestmentsTab() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('newest');
  const [status, setStatus] = useState('pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, sort, search, status }),
    [page, limit, sort, search, status],
  );

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['investor-investments', listQuery],
    queryFn: () => investorsApi.getAllInvestments(listQuery),
  });

  const approve = useMutation({
    mutationFn: (id: string) => {
      setActionId(id);
      return investorsApi.approveInvestment(id);
    },
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Investment approved — amount credited to investor wallet.' });
      void qc.invalidateQueries({ queryKey: ['investor-investments'] });
    },
    onError: (err) => {
      setBanner({ type: 'err', text: getApiErrorMessage(err, 'Failed to approve investment') });
    },
    onSettled: () => setActionId(null),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => investorsApi.rejectInvestment(rejectId!, reason),
    onSuccess: () => {
      setBanner({ type: 'ok', text: 'Investment rejected.' });
      setRejectId(null);
      setRejectReason('');
      void qc.invalidateQueries({ queryKey: ['investor-investments'] });
    },
    onError: (err) => {
      setBanner({ type: 'err', text: getApiErrorMessage(err, 'Failed to reject investment') });
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <>
      {banner && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            banner.type === 'ok'
              ? 'bg-secondary-container text-on-secondary-container'
              : 'bg-error-container text-on-error-container'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total
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
            Pending on page
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">
            {items.filter((i) => i.status === 'pending').length}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Input
            className="min-w-0 flex-1 sm:min-w-[220px]"
            placeholder="Search reference, email, phone…"
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
          <select
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
          </div>
          <CsvDownloadButton<Investment>
            title="Investments"
            filename={`investments-${status}`}
            filters={{ Status: status, Search: search, Sort: sort }}
            disabled={!total}
            columns={[
              { header: 'Reference', value: (r) => r.referenceId },
              { header: 'Status', value: (r) => r.status },
              { header: 'Amount', value: (r) => r.amount },
              { header: 'Method', value: (r) => r.method },
              { header: 'Investor name', value: (r) => personCsvCells(r.investorId)[0] },
              { header: 'Investor email', value: (r) => personCsvCells(r.investorId)[1] },
              { header: 'Investor phone', value: (r) => personCsvCells(r.investorId)[2] },
              { header: 'Created', value: (r) => r.createdAt },
            ]}
            fetchRows={() =>
              fetchAllPages((p, l) =>
                investorsApi.getAllInvestments({ ...listQuery, page: p, limit: l }),
              )
            }
          />
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <EmptyState message={getApiErrorMessage(error, 'Failed to load investments')} icon="error" />
        ) : !items.length ? (
          <EmptyState message="No investment requests found" icon="savings" />
        ) : (
          <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((item) => {
              const busy = actionId === item._id;
              return (
                <div
                  key={item._id}
                  className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.referenceId}</p>
                    <p className="text-xs text-on-surface-variant sm:text-sm">
                      {formatDate(item.createdAt)}
                    </p>
                    <p className="mt-1 truncate text-xs text-on-surface-variant">
                      {personLabel(item.investorId)}
                    </p>
                    {item.method ? (
                      <p className="mt-1 text-xs font-semibold uppercase text-secondary">{item.method}</p>
                    ) : null}
                    {item.note ? (
                      <p className="text-xs text-on-surface-variant">{item.note}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <p className="font-bold text-secondary">{formatCurrency(item.amount)}</p>
                    <StatusBadge status={item.status} />
                    {item.status === 'pending' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy && approve.isPending}
                          disabled={!!actionId && !busy}
                          onClick={() => {
                            setBanner(null);
                            approve.mutate(item._id);
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!!actionId}
                          onClick={() => {
                            setBanner(null);
                            setRejectId(item._id);
                            setRejectReason('');
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <Modal
        open={!!rejectId}
        onClose={() => {
          if (!reject.isPending) setRejectId(null);
        }}
        title="Reject Investment"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            reject.mutate(rejectReason);
          }}
        >
          <Input
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            required
            disabled={reject.isPending}
          />
          {reject.isError && (
            <p className="text-sm text-on-error-container">
              {getApiErrorMessage(reject.error, 'Reject failed')}
            </p>
          )}
          <Button type="submit" variant="danger" className="w-full" loading={reject.isPending}>
            Confirm Reject
          </Button>
        </form>
      </Modal>
    </>
  );
}
