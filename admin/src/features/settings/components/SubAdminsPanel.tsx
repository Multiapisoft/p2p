'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import type { User, Paginated } from '@/shared/types/api.types';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { PermissionChips } from './PermissionChips';
import { BusinessAssignList } from './BusinessAssignList';
import {
  DEFAULT_SUB_ADMIN_PERMS,
  LOGIN_AS_PERMISSIONS,
  MODULE_PERMISSIONS,
  businessIdOf,
  permissionLabel,
} from '../constants/sub-admin-permissions';

type BizOption = {
  _id: string;
  name: string;
  referralCode?: string | null;
  status?: string;
};

export function SubAdminsPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState<string[]>([...DEFAULT_SUB_ADMIN_PERMS]);
  const [assignedBizIds, setAssignedBizIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editBizIds, setEditBizIds] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [subError, setSubError] = useState('');
  const [subSuccess, setSubSuccess] = useState('');
  const [subSearch, setSubSearch] = useState('');

  const { data: subAdmins, isLoading: loadingSubs } = useQuery({
    queryKey: ['sub-admins'],
    queryFn: () => apiGet<Paginated<User>>('/admin/sub-admins', { page: 1, limit: 100 }),
  });

  const {
    data: businessesData,
    isError: businessesError,
    isLoading: businessesLoading,
  } = useQuery({
    queryKey: ['admin-business-options'],
    queryFn: () => apiGet<BizOption[]>('/admin/business-options'),
  });
  const businesses = Array.isArray(businessesData) ? businessesData : [];

  const filteredSubs = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    if (!q) return subAdmins?.items ?? [];
    return (subAdmins?.items ?? []).filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [subAdmins, subSearch]);

  const bizNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of businesses) map.set(b._id, b.name);
    return map;
  }, [businesses]);

  const createSubAdmin = useMutation({
    mutationFn: () =>
      apiPost('/admin/sub-admins', {
        name: name.trim(),
        email: email.trim(),
        password,
        permissions: perms,
        assignedBusinessIds: assignedBizIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-admins'] });
      setName('');
      setEmail('');
      setPassword('');
      setPerms([...DEFAULT_SUB_ADMIN_PERMS]);
      setAssignedBizIds([]);
      setSubError('');
      setSubSuccess('Sub-admin created');
      setCreateOpen(false);
    },
    onError: (err) => {
      setSubSuccess('');
      setSubError(getApiErrorMessage(err, 'Could not create sub-admin'));
    },
  });

  const updateSubAdmin = useMutation({
    mutationFn: () =>
      apiPatch(`/admin/sub-admins/${editTarget!._id}`, {
        name: editName.trim() || undefined,
        permissions: editPerms,
        assignedBusinessIds: editBizIds,
        ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-admins'] });
      setEditTarget(null);
      setEditPassword('');
      setSubError('');
      setSubSuccess('Sub-admin updated');
    },
    onError: (err) => {
      setSubSuccess('');
      setSubError(getApiErrorMessage(err, 'Could not update sub-admin'));
    },
  });

  const total = subAdmins?.items.length ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-headline)] text-lg font-semibold sm:text-xl">
            Sub-admins
          </h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Create staff accounts, assign module access, login-as rights, and businesses.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setSubError('');
            setCreateOpen(true);
          }}
        >
          Create sub-admin
        </Button>
      </div>

      {subSuccess ? (
        <p className="rounded-lg border border-secondary/30 bg-secondary/5 px-3 py-2 text-sm text-secondary">
          {subSuccess}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total
          </p>
          <p className="mt-1 text-xl font-bold sm:text-2xl">{total}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Showing
          </p>
          <p className="mt-1 text-xl font-bold sm:text-2xl">{filteredSubs.length}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 sm:col-span-1 sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Businesses
          </p>
          <p className="mt-1 text-xl font-bold sm:text-2xl">{businesses.length}</p>
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <Input
            placeholder="Search by name or email…"
            value={subSearch}
            onChange={(e) => setSubSearch(e.target.value)}
          />
        </div>

        {loadingSubs ? (
          <p className="text-sm text-on-surface-variant">Loading sub-admins…</p>
        ) : !total ? (
          <div className="rounded-xl border border-dashed border-outline-variant px-4 py-10 text-center">
            <p className="text-sm font-medium">No sub-admins yet</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Create one to delegate deposits, support, or login-as access.
            </p>
            <Button
              type="button"
              className="mt-4"
              onClick={() => {
                setSubError('');
                setCreateOpen(true);
              }}
            >
              Create first sub-admin
            </Button>
          </div>
        ) : filteredSubs.length ? (
          <div className="space-y-2">
            {filteredSubs.map((s) => {
              const bizIds = (s.assignedBusinessIds || []).map((id) => businessIdOf(id));
              const loginAs = (s.permissions || []).filter((p) => p.startsWith('login_as.'));
              const modules = (s.permissions || []).filter((p) => !p.startsWith('login_as.'));
              return (
                <div
                  key={s._id}
                  className="flex flex-col gap-3 rounded-xl border border-outline-variant/80 bg-surface-container-low/20 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-4"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="font-medium">
                        {s.name}{' '}
                        <span className="font-normal text-on-surface-variant">· {s.email}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        {bizIds.length
                          ? bizIds.map((id) => bizNameById.get(id) || id.slice(-6)).join(', ')
                          : 'No businesses assigned'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {modules.slice(0, 6).map((p) => (
                        <span
                          key={p}
                          className="rounded-full border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-[10px] sm:text-xs"
                        >
                          {permissionLabel(p)}
                        </span>
                      ))}
                      {modules.length > 6 ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] text-on-surface-variant sm:text-xs">
                          +{modules.length - 6} more
                        </span>
                      ) : null}
                      {loginAs.map((p) => (
                        <span
                          key={p}
                          className="rounded-full border border-secondary/40 bg-secondary-container/40 px-2 py-0.5 text-[10px] sm:text-xs"
                        >
                          {permissionLabel(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 self-start"
                    onClick={() => {
                      setEditTarget(s);
                      setEditName(s.name);
                      setEditPerms([...(s.permissions || [])]);
                      setEditBizIds(bizIds);
                      setEditPassword('');
                      setSubError('');
                      setSubSuccess('');
                    }}
                  >
                    Edit rights
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">No matches for “{subSearch}”</p>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => {
          if (createSubAdmin.isPending) return;
          setCreateOpen(false);
          setSubError('');
        }}
        title="Create sub-admin"
        className="sm:max-w-lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubError('');
            setSubSuccess('');
            createSubAdmin.mutate();
          }}
        >
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <div>
            <p className="mb-2 text-sm font-semibold">Module access</p>
            <PermissionChips options={MODULE_PERMISSIONS} selected={perms} onChange={setPerms} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">Login as access</p>
            <p className="mb-2 text-xs text-on-surface-variant">
              Only selected roles can be opened via Login as (users/businesses still scoped to
              assigned businesses).
            </p>
            <PermissionChips
              options={LOGIN_AS_PERMISSIONS}
              selected={perms}
              onChange={setPerms}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">Businesses they can control</p>
            <p className="mb-2 text-xs text-on-surface-variant">
              Limits deposits, withdrawals, commissions, and transactions to these businesses.
            </p>
            <BusinessAssignList
              businesses={businesses}
              loading={businessesLoading}
              error={businessesError}
              selected={assignedBizIds}
              onChange={setAssignedBizIds}
            />
          </div>
          {subError ? (
            <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
              {subError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={createSubAdmin.isPending}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createSubAdmin.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => {
          if (updateSubAdmin.isPending) return;
          setEditTarget(null);
          setSubError('');
        }}
        title="Edit sub-admin"
        className="sm:max-w-lg"
      >
        {editTarget ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSubError('');
              updateSubAdmin.mutate();
            }}
          >
            <p className="text-sm text-on-surface-variant">{editTarget.email}</p>
            <Input
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <Input
              label="New password (optional)"
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              minLength={8}
            />
            <div>
              <p className="mb-2 text-sm font-semibold">Module access</p>
              <PermissionChips
                options={MODULE_PERMISSIONS}
                selected={editPerms}
                onChange={setEditPerms}
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">Login as access</p>
              <p className="mb-2 text-xs text-on-surface-variant">
                Only allowed roles can be opened via Login as.
              </p>
              <PermissionChips
                options={LOGIN_AS_PERMISSIONS}
                selected={editPerms}
                onChange={setEditPerms}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Businesses they can control</p>
              <BusinessAssignList
                businesses={businesses}
                loading={businessesLoading}
                error={businessesError}
                selected={editBizIds}
                onChange={setEditBizIds}
              />
            </div>
            {subError ? (
              <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                {subError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
                disabled={updateSubAdmin.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" loading={updateSubAdmin.isPending}>
                Save changes
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
