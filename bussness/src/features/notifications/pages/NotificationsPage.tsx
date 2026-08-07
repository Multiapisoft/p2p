'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/features/notifications/api/notifications.api';
import { getApiErrorMessage } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { formatDate } from '@/shared/lib/utils';

const UNREAD_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Unread only' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Read status' },
];

const PAGE_SIZES = [5, 10, 20];

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [unreadOnly, setUnreadOnly] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, unreadOnly, sort, search }),
    [page, limit, unreadOnly, sort, search],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['notifications', listQuery],
    queryFn: () => notificationsApi.getAll(listQuery),
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      setActionError('');
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
    onError: (err) => setActionError(getApiErrorMessage(err, 'Could not mark all as read')),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const unreadOnPage = items.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Business alerts & updates"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
          >
            Mark all read
          </Button>
        }
      />

      {actionError && (
        <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-3 text-sm text-on-surface">
          {actionError}
        </div>
      )}

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
            Unread here
          </p>
          <p className="mt-1 text-2xl font-bold">{unreadOnPage}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search title, message…"
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
            {UNREAD_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setUnreadOnly(f.value);
                  setPage(1);
                }}
                className={`chip ${unreadOnly === f.value ? 'chip-active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : isError ? (
          <div className="rounded-2xl border border-error/30 bg-error-container/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-on-surface">
              {getApiErrorMessage(error, 'Could not load notifications')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || unreadOnly !== 'all'
                ? 'No notifications match your filters'
                : 'No notifications'
            }
            icon="notifications"
          />
        ) : (
          <>
            <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((n) => (
                <div
                  key={n._id}
                  className={`rounded-lg border p-4 ${!n.isRead ? 'border-secondary bg-secondary-container/20' : 'border-outline-variant'}`}
                >
                  <p className="font-semibold">{n.title}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">{n.message}</p>
                  <p className="mt-2 text-xs text-outline">{formatDate(n.createdAt)}</p>
                </div>
              ))}
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
