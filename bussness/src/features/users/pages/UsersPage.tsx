'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { User } from '@/shared/types/api.types';

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
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [codeUser, setCodeUser] = useState<User | null>(null);
  const [userCode, setUserCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeSuccess, setCodeSuccess] = useState('');
  const qc = useQueryClient();

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

  const resetPassword = useMutation({
    mutationFn: () => usersApi.setUserPassword(passwordUser!._id, newPassword),
    onSuccess: () => {
      setPasswordSuccess('Password updated. Share the new password with the user securely.');
      setPasswordError('');
      setNewPassword('');
      setConfirmPassword('');
      qc.invalidateQueries({ queryKey: ['business-users'] });
    },
    onError: (err) => {
      setPasswordSuccess('');
      setPasswordError(getApiErrorMessage(err, 'Could not update password'));
    },
  });

  const saveUserCode = useMutation({
    mutationFn: () => usersApi.setUserCode(codeUser!._id, userCode.trim()),
    onSuccess: () => {
      setCodeSuccess('Identification code saved');
      setCodeError('');
      qc.invalidateQueries({ queryKey: ['business-users'] });
      qc.invalidateQueries({ queryKey: ['business-user-detail'] });
    },
    onError: (err) => {
      setCodeSuccess('');
      setCodeError(getApiErrorMessage(err, 'Could not save code'));
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  function openPasswordModal(u: User) {
    setPasswordUser(u);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
  }

  function openCodeModal(u: User) {
    setCodeUser(u);
    setUserCode(u.businessUserCode || '');
    setCodeError('');
    setCodeSuccess('');
  }

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    resetPassword.mutate();
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    setCodeError('');
    setCodeSuccess('');
    if (!userCode.trim()) {
      setCodeError('Code is required');
      return;
    }
    saveUserCode.mutate();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Integrated Users"
        description="Users linked via referral / API — view details or reset login password"
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

          <div className="chip-scroll">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`chip ${status === s.value ? 'chip-active' : ''}`}
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
                    <th className="pb-3 pr-4 font-semibold text-on-surface-variant">Code</th>
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
                      <td className="py-3 pr-4 font-mono text-xs text-on-surface-variant">
                        {u.businessUserCode || '—'}
                      </td>
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
                          <button
                            type="button"
                            onClick={() => openCodeModal(u)}
                            className="text-sm font-semibold text-on-surface-variant hover:underline"
                          >
                            {u.businessUserCode ? 'Edit code' : 'Set code'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openPasswordModal(u)}
                            className="text-sm font-semibold text-on-surface-variant hover:underline"
                          >
                            Reset password
                          </button>
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
              <DetailRow
                label="User code"
                value={
                  detail.user.businessUserCode ||
                  items.find((x) => x._id === selectedId)?.businessUserCode ||
                  '—'
                }
              />
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
              <p className="mb-2 text-sm font-semibold">FairPlay wallet</p>
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => {
                  const u = items.find((x) => x._id === selectedId);
                  if (u) openCodeModal(u);
                  else if (selectedId) {
                    openCodeModal({
                      _id: selectedId,
                      email: detail.user.email,
                      name: detail.user.name,
                      role: 'user',
                      status: 'active',
                      createdAt: '',
                      businessUserCode: detail.user.businessUserCode,
                    } as User);
                  }
                }}
              >
                Set / edit code
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                onClick={() => {
                  const u = items.find((x) => x._id === selectedId);
                  if (u) openPasswordModal(u);
                  else if (selectedId) {
                    openPasswordModal({
                      _id: selectedId,
                      email: detail.user.email,
                      name: detail.user.name,
                      role: 'user',
                      status: 'active',
                      createdAt: '',
                    } as User);
                  }
                }}
              >
                Reset password
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!passwordUser}
        onClose={() => {
          if (resetPassword.isPending) return;
          setPasswordUser(null);
          setPasswordError('');
          setPasswordSuccess('');
        }}
        title="Reset user password"
        className="sm:max-w-md"
      >
        {passwordUser ? (
          <form className="space-y-4" onSubmit={submitPassword}>
            <p className="text-sm text-on-surface-variant">
              Set a new login password for{' '}
              <strong>
                {passwordUser.name} ({passwordUser.email})
              </strong>
              . Share it securely — it will not be shown again.
            </p>
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              required
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
            {passwordError ? (
              <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                {passwordError}
              </p>
            ) : null}
            {passwordSuccess ? (
              <p className="rounded-lg border border-secondary/30 bg-secondary/5 px-3 py-2 text-sm text-secondary">
                {passwordSuccess}
              </p>
            ) : null}
            <Button type="submit" className="w-full" loading={resetPassword.isPending}>
              Update password
            </Button>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={!!codeUser}
        onClose={() => {
          if (saveUserCode.isPending) return;
          setCodeUser(null);
          setCodeError('');
          setCodeSuccess('');
        }}
        title={codeUser?.businessUserCode ? 'Edit user code' : 'Set user code'}
        className="sm:max-w-md"
      >
        {codeUser ? (
          <form className="space-y-4" onSubmit={submitCode}>
            <p className="text-sm text-on-surface-variant">
              Assign an identification code for{' '}
              <strong>
                {codeUser.name} ({codeUser.email})
              </strong>{' '}
              so your team can recognize this user.
            </p>
            <Input
              label="Identification code"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
              placeholder="e.g. MAH-001"
              required
            />
            {codeError ? (
              <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                {codeError}
              </p>
            ) : null}
            {codeSuccess ? (
              <p className="rounded-lg border border-secondary/30 bg-secondary/5 px-3 py-2 text-sm text-secondary">
                {codeSuccess}
              </p>
            ) : null}
            <Button type="submit" className="w-full" loading={saveUserCode.isPending}>
              Save code
            </Button>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
