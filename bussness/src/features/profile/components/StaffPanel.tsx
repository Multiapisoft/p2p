'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { getApiErrorMessage } from '@/shared/api/client';
import type { User } from '@/shared/types/api.types';

const STAFF_PERMS = [
  { id: 'business.deposit_verify', label: 'Deposit verify' },
  { id: 'business.withdrawals', label: 'Withdrawals' },
  { id: 'business.manual_withdrawal', label: 'Manual withdrawal' },
];

export function StaffPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['business-staff'],
    queryFn: () => apiGet<{ items: User[]; total: number }>('/business/me/staff'),
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState<string[]>(['business.withdrawals']);
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiPost('/business/me/staff', { name, email, password, permissions: perms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-staff'] });
      setName('');
      setEmail('');
      setPassword('');
      setError('');
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not add staff')),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch(`/business/me/staff/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-staff'] }),
  });

  return (
    <Card title="Staff roles">
      <p className="mb-4 text-sm text-on-surface-variant">
        Add team members who can verify deposits, manage withdrawals, or raise a manual
        business withdrawal. They log in on this business portal.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
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
        <div className="flex flex-wrap gap-2">
          {STAFF_PERMS.map((p) => (
            <label
              key={p.id}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                perms.includes(p.id)
                  ? 'border-secondary bg-secondary-container'
                  : 'border-outline-variant'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={perms.includes(p.id)}
                onChange={() =>
                  setPerms((prev) =>
                    prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                  )
                }
              />
              {p.label}
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <Button type="submit" loading={create.isPending}>
          Add staff
        </Button>
      </form>
      {(data?.items.length ?? 0) > 0 ? (
        <ul className="mt-4 divide-y divide-outline-variant border-t border-outline-variant">
          {data!.items.map((s) => (
            <li key={s._id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                {s.name} ({s.email}) — {(s as User & { permissions?: string[] }).permissions?.join(', ') || 'no perms'}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  toggleStatus.mutate({
                    id: s._id,
                    status: s.status === 'active' ? 'suspended' : 'active',
                  })
                }
              >
                {s.status === 'active' ? 'Suspend' : 'Activate'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
