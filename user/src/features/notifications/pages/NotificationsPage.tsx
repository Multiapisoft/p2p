'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { notificationsApi } from '@/features/profile/api/profile.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatDate } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast/toast.store';

const READ_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const PAGE_SIZES = [5, 10, 20];

function notificationErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg) && msg.length) return msg.join(', ');
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not load notifications';
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [readFilter, setReadFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({
      page,
      limit,
      search,
      sort,
      unread: readFilter === 'unread' ? true : undefined,
      read: readFilter === 'read' ? true : undefined,
    }),
    [page, limit, search, sort, readFilter],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['notifications', listQuery],
    queryFn: () => notificationsApi.getAll(listQuery),
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
      toast.success('All marked as read');
    },
    onError: (err) => toast.error('Failed', notificationErrorMessage(err)),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const unreadOnPage = items.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl">
            Notifications
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">Account alerts & updates</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => markAll.mutate()}
          loading={markAll.isPending}
        >
          Mark all read
        </Button>
      </div>

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
            Unread
          </p>
          <p className="mt-1 text-lg font-bold sm:mt-2 sm:text-2xl">{unreadOnPage}</p>
          <p className="mt-0.5 hidden text-xs text-on-surface-variant sm:block">On this page</p>
        </div>
      </div>

      <Card title="Inbox">
        <div className="mb-4 space-y-3 sm:mb-5 sm:space-y-4">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:gap-3">
            <div className="min-w-0 flex-1">
              <Input
                label="Search"
                icon="search"
                placeholder="Title, message…"
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
            {READ_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setReadFilter(f.value);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  readFilter === f.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                }`}
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
              {notificationErrorMessage(error) || 'Could not load notifications'}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || readFilter !== 'all'
                ? 'No notifications match your filters'
                : 'No notifications yet'
            }
            icon="notifications"
          />
        ) : (
          <>
            <div className={`space-y-2 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((n) => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => !n.isRead && markRead.mutate(n._id)}
                  className={`w-full rounded-lg border border-outline-variant p-3 text-left transition-colors hover:bg-surface-container-low sm:rounded-xl sm:p-4 ${
                    !n.isRead ? 'bg-secondary-container/20' : ''
                  }`}
                >
                  <p className="text-sm font-semibold sm:text-base">{n.title}</p>
                  <p className="mt-1 line-clamp-3 text-xs text-on-surface-variant sm:text-sm">{n.message}</p>
                  <p className="mt-1.5 text-[11px] text-outline sm:mt-2 sm:text-xs">{formatDate(n.createdAt)}</p>
                </button>
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
    </div>
  );
}
