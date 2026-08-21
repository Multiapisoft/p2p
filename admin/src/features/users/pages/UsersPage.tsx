'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatDate } from '@/shared/lib/utils';
import { fetchAllPages } from '@/shared/lib/csv';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { User } from '@/shared/types/api.types';

const ROLES = [
  { value: 'all', label: 'All roles' },
  { value: 'user', label: 'User' },
  { value: 'business', label: 'Business' },
  { value: 'investor', label: 'Investor' },
  { value: 'sub_admin', label: 'Sub admin' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending', label: 'Pending' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZES = [5, 10, 20];

export function UsersPage() {
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, role, status, sort, search }),
    [page, limit, role, status, sort, search],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['users', listQuery],
    queryFn: () => usersApi.list(listQuery),
  });

  const { data: userDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['user', detailUser?._id],
    queryFn: () => usersApi.getById(detailUser!._id),
    enabled: !!detailUser,
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: string }) =>
      usersApi.updateStatus(id, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const activeOnPage = items.filter((u) => u.status === 'active').length;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Users</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">Manage platform participants</p>
        </div>
        <CsvDownloadButton<User>
          title="Users"
          filename={`users-${role}-${status}`}
          filters={{ Role: role, Status: status, Search: search, Sort: sort }}
          disabled={!total}
          columns={[
            { header: 'Name', value: (u) => u.name },
            { header: 'Email', value: (u) => u.email },
            { header: 'Phone', value: (u) => u.phone || '' },
            { header: 'Role', value: (u) => u.role },
            { header: 'Status', value: (u) => u.status },
            { header: 'User code', value: (u) => u.businessUserCode || '' },
            { header: 'Created', value: (u) => u.createdAt },
          ]}
          fetchRows={() => fetchAllPages((p, l) => usersApi.list({ ...listQuery, page: p, limit: l }))}
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
            Active here
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{activeOnPage}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search name, email, phone…"
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
            {STATUS_FILTERS.map((s) => (
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

          <div className="chip-scroll">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setRole(r.value);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm ${
                  role === r.value ? 'bg-secondary text-on-secondary' : 'border border-outline-variant'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No users match your filters" />
        ) : (
          <div className={isFetching ? 'opacity-70' : ''}>
            <div className="space-y-2 md:hidden">
              {items.map((u) => (
                <div key={u._id} className="rounded-lg border border-outline-variant p-3">
                  <button type="button" className="w-full text-left" onClick={() => setDetailUser(u)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{u.name}</p>
                        <p className="truncate text-xs text-on-surface-variant">{u.email}</p>
                        {u.phone ? (
                          <p className="truncate text-xs text-on-surface-variant">{u.phone}</p>
                        ) : null}
                      </div>
                      <StatusBadge status={u.status} />
                    </div>
                    <p className="mt-1.5 text-xs capitalize text-on-surface-variant">
                      {u.role.replace('_', ' ')} • {formatDate(u.createdAt)}
                    </p>
                    {u.referredBusiness?.name ? (
                      <p className="mt-1.5">
                        <span className="inline-block rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold text-on-secondary-container">
                          {u.referredBusiness.name}
                          {u.businessUserCode ? ` · ${u.businessUserCode}` : ''}
                        </span>
                      </p>
                    ) : null}
                  </button>
                  {u.role !== 'admin' && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant={u.status === 'active' ? 'danger' : 'secondary'}
                        className="w-full"
                        onClick={() =>
                          toggleStatus.mutate({
                            id: u._id,
                            status: u.status === 'active' ? 'suspended' : 'active',
                          })
                        }
                      >
                        {u.status === 'active' ? 'Suspend' : 'Activate'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto custom-scrollbar md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-outline-variant bg-surface-container-low">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">User</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Phone</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Business</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Role</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Status</th>
                    <th className="px-3 py-2.5 font-semibold text-on-surface-variant sm:px-4 sm:py-3">Joined</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-on-surface-variant sm:px-4 sm:py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {items.map((u) => (
                    <tr key={u._id} className="hover:bg-surface-container-low">
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => setDetailUser(u)}
                        >
                          <p className="font-medium">{u.name}</p>
                          <p className="text-on-surface-variant">{u.email}</p>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">{u.phone || '—'}</td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        {u.referredBusiness?.name ? (
                          <div className="space-y-0.5">
                            <span className="inline-block rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold text-on-secondary-container">
                              {u.referredBusiness.name}
                            </span>
                            {u.businessUserCode ? (
                              <p className="font-mono text-xs text-on-surface-variant">{u.businessUserCode}</p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 capitalize sm:px-4 sm:py-3">{u.role.replace('_', ' ')}</td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-3 py-2.5 text-on-surface-variant sm:px-4 sm:py-3">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right sm:px-4 sm:py-3">
                        {u.role !== 'admin' && (
                          <Button
                            size="sm"
                            variant={u.status === 'active' ? 'danger' : 'secondary'}
                            onClick={() =>
                              toggleStatus.mutate({
                                id: u._id,
                                status: u.status === 'active' ? 'suspended' : 'active',
                              })
                            }
                          >
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
                          </Button>
                        )}
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

      <Modal open={!!detailUser} onClose={() => setDetailUser(null)} title="User Details">
        {loadingDetail ? (
          <LoadingScreen />
        ) : userDetail ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-on-surface-variant">ID:</span>{' '}
              <span className="font-mono text-xs">{userDetail._id}</span>
            </p>
            <p>
              <span className="text-on-surface-variant">Name:</span> {userDetail.name}
            </p>
            <p>
              <span className="text-on-surface-variant">Email:</span> {userDetail.email}
            </p>
            <p>
              <span className="text-on-surface-variant">Phone:</span> {userDetail.phone || '—'}
            </p>
            <p>
              <span className="text-on-surface-variant">Role:</span>{' '}
              <span className="capitalize">{userDetail.role.replace('_', ' ')}</span>
            </p>
            <p>
              <span className="text-on-surface-variant">Business:</span>{' '}
              {userDetail.referredBusiness?.name ? (
                <span className="inline-block rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold text-on-secondary-container">
                  {userDetail.referredBusiness.name}
                  {userDetail.referredBusiness.referralCode
                    ? ` (${userDetail.referredBusiness.referralCode})`
                    : ''}
                </span>
              ) : (
                '—'
              )}
            </p>
            {userDetail.businessUserCode ? (
              <p>
                <span className="text-on-surface-variant">Business user code:</span>{' '}
                <span className="font-mono">{userDetail.businessUserCode}</span>
              </p>
            ) : null}
            <p>
              <span className="text-on-surface-variant">Status:</span>{' '}
              <StatusBadge status={userDetail.status} />
            </p>
            {userDetail.permissions?.length ? (
              <div>
                <p className="text-on-surface-variant">Permissions:</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {userDetail.permissions.map((p) => (
                    <span key={p} className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <p>
              <span className="text-on-surface-variant">Joined:</span> {formatDate(userDetail.createdAt)}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
