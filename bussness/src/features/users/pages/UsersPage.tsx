'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/features/users/api/users.api';
import { integrationApi } from '@/features/integration/api/integration.api';
import { getApiErrorMessage } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { Modal } from '@/shared/components/ui/Modal';
import { formatCurrency, formatDate } from '@/shared/lib/utils';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending', label: 'Pending' },
];

const ROLE_FILTERS = [
  { value: 'all', label: 'All roles' },
  { value: 'user', label: 'User' },
  { value: 'investor', label: 'Investor' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Status' },
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

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, status, role, sort, search }),
    [page, limit, status, role, sort, search],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['business-users', listQuery],
    queryFn: () => usersApi.getBusinessUsers(listQuery),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['business-user-detail', selectedId],
    queryFn: () => integrationApi.getUserDetails(selectedId!),
    enabled: !!selectedId,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Integrated Users"
        description="Users registered via your business API"
        action={
          <Link href="/integration?tab=tools">
            <Button variant="secondary" size="sm">
              User Tools
            </Button>
          </Link>
        }
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
            Active here
          </p>
          <p className="mt-1 text-2xl font-bold">
            {items.filter((u) => u.status === 'active').length}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search name, email, phone, ref…"
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
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              {ROLE_FILTERS.map((o) => (
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
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  status === s.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant'
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
              {getApiErrorMessage(error, 'Could not load users')}
            </p>
            <Button type="button" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all' || role !== 'all'
                ? 'No users match your filters'
                : 'No users linked yet'
            }
            icon="group"
          />
        ) : (
          <>
            <div className={`overflow-x-auto ${isFetching ? 'opacity-70' : ''}`}>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-outline-variant">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Name</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Email</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Phone</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Role</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Status</th>
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Joined</th>
                    <th className="pb-3 font-semibold text-on-surface-variant">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <tr key={u._id} className="border-b border-outline-variant/50">
                      <td className="py-3 pr-4 font-medium">{u.name}</td>
                      <td className="py-3 pr-4 text-on-surface-variant">{u.email}</td>
                      <td className="py-3 pr-4 text-on-surface-variant">{u.phone || '—'}</td>
                      <td className="py-3 pr-4 capitalize text-on-surface-variant">{u.role}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="py-3 pr-4 text-on-surface-variant">{formatDate(u.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedId(u._id)}
                            className="text-sm font-semibold text-secondary hover:underline"
                          >
                            Details
                          </button>
                          <Link
                            href={`/integration?tab=tools&userId=${u._id}`}
                            className="text-sm font-semibold text-on-surface-variant hover:underline"
                          >
                            Manage
                          </Link>
                        </div>
                      </td>
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
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="User details"
        className="sm:max-w-xl"
      >
        {loadingDetail || !detail ? (
          <LoadingScreen />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <DetailRow label="Name" value={detail.user.name} />
              <DetailRow label="Email" value={detail.user.email} />
              <DetailRow label="Phone" value={detail.user.phone || '—'} />
              <DetailRow label="External ref" value={detail.user.externalRef || '—'} />
              <DetailRow label="User ID" value={detail.user._id || detail.user.userId} />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Partner wallet</p>
              {detail.partnerBalance ? (
                <div className="space-y-1 rounded-xl bg-surface-container-low p-3">
                  <DetailRow
                    label="Available"
                    value={formatCurrency(
                      detail.partnerBalance.availableBalance,
                      detail.partnerBalance.currency,
                    )}
                  />
                  <DetailRow
                    label="Balance"
                    value={formatCurrency(
                      detail.partnerBalance.balance,
                      detail.partnerBalance.currency,
                    )}
                  />
                  <DetailRow
                    label="Locked"
                    value={formatCurrency(
                      detail.partnerBalance.lockedBalance,
                      detail.partnerBalance.currency,
                    )}
                  />
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">Partner balance not available</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">FinGuard wallet</p>
              <div className="space-y-1 rounded-xl bg-surface-container-low p-3">
                <DetailRow
                  label="Available"
                  value={formatCurrency(
                    detail.balance.availableBalance,
                    detail.balance.currency || 'INR',
                  )}
                />
                <DetailRow
                  label="Balance"
                  value={formatCurrency(detail.balance.balance, detail.balance.currency || 'INR')}
                />
                <DetailRow
                  label="Locked"
                  value={formatCurrency(
                    detail.balance.lockedBalance,
                    detail.balance.currency || 'INR',
                  )}
                />
              </div>
            </div>

            <Link href={`/integration?tab=tools&userId=${selectedId}`}>
              <Button className="w-full" variant="secondary">
                Open User Tools
              </Button>
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}
