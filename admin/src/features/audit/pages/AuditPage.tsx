'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit.api';
import { Card } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatDate } from '@/shared/lib/utils';
import { fetchAllPages } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { AuditLog } from '@/shared/types/api.types';

const ACTION_FILTERS = [
  { value: 'all', label: 'All actions' },
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'adjust', label: 'Adjust' },
];

const RESOURCE_FILTERS = [
  { value: 'all', label: 'All resources' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'user', label: 'User' },
  { value: 'business', label: 'Business' },
  { value: 'wallet', label: 'Wallet' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const PAGE_SIZES = [5, 10, 20, 50];

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('all');
  const [resource, setResource] = useState('all');
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
    () => ({ page, limit, status, resource, sort, search }),
    [page, limit, status, resource, sort, search],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit', listQuery],
    queryFn: () => auditApi.getAll(listQuery),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Audit Logs</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">Admin action history</p>
        </div>
        <CsvDownloadButton<AuditLog>
          title="Audit log"
          filename={`audit-${status}`}
          filters={{ Status: status, Resource: resource, Search: search, Sort: sort }}
          disabled={!total}
          columns={[
            { header: 'Actor', value: (a) => a.actorEmail },
            { header: 'Action', value: (a) => a.action },
            { header: 'Resource', value: (a) => a.resource },
            { header: 'Resource ID', value: (a) => a.resourceId || '' },
            { header: 'Created', value: (a) => a.createdAt },
          ]}
          fetchRows={() =>
            fetchAllPages((p, l) => auditApi.getAll({ ...listQuery, page: p, limit: l }))
          }
        />
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
            Actors
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">
            {new Set(items.map((l) => l.actorEmail)).size}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search action, resource, email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm"
              value={resource}
              onChange={(e) => {
                setResource(e.target.value);
                setPage(1);
              }}
            >
              {RESOURCE_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
            {ACTION_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm ${
                  status === s.value ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No audit logs match your filters" icon="history" />
        ) : (
          <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
            {items.map((log) => (
              <div
                key={log._id}
                className="flex flex-col gap-1 rounded-lg border border-outline-variant p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="font-semibold">{log.action}</span>
                  <span className="text-on-surface-variant"> on {log.resource}</span>
                  {log.resourceId && (
                    <span className="text-xs text-outline"> #{log.resourceId.slice(-6)}</span>
                  )}
                </div>
                <div className="shrink-0 text-xs text-on-surface-variant sm:text-sm">
                  {log.actorEmail} • {formatDate(log.createdAt)}
                </div>
              </div>
            ))}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
