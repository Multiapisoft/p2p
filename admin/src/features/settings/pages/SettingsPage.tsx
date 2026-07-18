'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import type { User, Paginated } from '@/shared/types/api.types';
import { useAuthStore } from '@/features/auth/store/auth.store';

import { PERMISSIONS } from '@/shared/constants/permissions';

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perms, setperms] = useState<string[]>(['deposits.manage', 'withdrawals.manage']);

  const { data: subAdmins } = useQuery({
    queryKey: ['sub-admins'],
    queryFn: () => apiGet<Paginated<User>>('/admin/sub-admins', { page: 1, limit: 100 }),
    enabled: user?.role === 'admin',
  });

  const [subSearch, setSubSearch] = useState('');
  const filteredSubs = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    if (!q) return subAdmins?.items ?? [];
    return (subAdmins?.items ?? []).filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q),
    );
  }, [subAdmins, subSearch]);

  const createSubAdmin = useMutation({
    mutationFn: () =>
      apiPost('/admin/sub-admins', { name, email, password, permissions: perms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-admins'] });
      setName('');
      setEmail('');
      setPassword('');
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">Account & sub-admin management</p>
      </div>

      <Card title="Your Account">
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-on-surface-variant">Email:</span> {user?.email}
          </p>
          <p>
            <span className="text-on-surface-variant">Role:</span>{' '}
            <span className="capitalize">{user?.role?.replace('_', ' ')}</span>
          </p>
        </div>
      </Card>

      {user?.role === 'admin' && (
        <Card title="Create Sub-Admin">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createSubAdmin.mutate();
            }}
          >
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <div>
              <p className="mb-2 text-sm font-semibold">Permissions</p>
              <div className="chip-scroll">
                {ALL_PERMISSIONS.map((p) => (
                  <label
                    key={p}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] sm:px-3 sm:text-xs ${
                      perms.includes(p) ? 'border-secondary bg-secondary-container' : 'border-outline-variant'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={perms.includes(p)}
                      onChange={() =>
                        setperms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                        )
                      }
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full sm:w-auto" loading={createSubAdmin.isPending}>
              Create Sub-Admin
            </Button>
          </form>

          {(subAdmins?.items.length ?? 0) > 0 ? (
            <div className="mt-6 border-t border-outline-variant pt-4">
              <p className="mb-3 text-sm font-semibold">
                Existing Sub-Admins ({filteredSubs.length}/{subAdmins?.items.length ?? 0})
              </p>
              <Input
                className="mb-3"
                placeholder="Search sub-admins…"
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
              />
              {filteredSubs.length ? (
                filteredSubs.map((s) => (
                  <div
                    key={s._id}
                    className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:justify-between"
                  >
                    <span className="min-w-0 break-words">
                      {s.name} ({s.email})
                    </span>
                    <span className="shrink-0 text-on-surface-variant">
                      {s.permissions?.length ?? 0} perms
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-on-surface-variant">No matches</p>
              )}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
