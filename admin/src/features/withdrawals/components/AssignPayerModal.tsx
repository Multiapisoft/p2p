'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/features/users/api/users.api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { asPerson } from '@/shared/lib/csv';
import type { User, Withdrawal } from '@/shared/types/api.types';

export function AssignPayerModal({
  open,
  withdrawal,
  loading,
  error,
  onClose,
  onAssign,
}: {
  open: boolean;
  withdrawal: Withdrawal | null;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onAssign: (assigneeId: string) => void;
}) {
  const [role, setRole] = useState<'user' | 'investor'>('user');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<User | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!open) {
      setSearchInput('');
      setSearch('');
      setPicked(null);
      setRole('user');
    }
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['assign-payer-users', role, search],
    queryFn: () =>
      usersApi.list({ page: 1, limit: 8, role, status: 'active', search, sort: 'newest' }),
    enabled: open,
  });

  const current = asPerson(withdrawal?.assignedTo);
  const ownerId =
    typeof withdrawal?.userId === 'string' ? withdrawal.userId : withdrawal?.userId?._id;
  const items = (data?.items ?? []).filter((u) => u._id !== ownerId);

  return (
    <Modal open={open} onClose={onClose} title="Assign payer" className="sm:max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-on-surface-variant">
          Sirf assigned user/investor ko ye withdrawal dikhega. Unko UTR ya payment slip
          upload karni hogi.
        </p>
        {current?.name || current?.email ? (
          <p className="rounded-xl bg-secondary-container/40 px-3 py-2 text-sm">
            Currently assigned:{' '}
            <span className="font-semibold">
              {current.name || current.email}
              {current.role ? ` · ${current.role}` : ''}
            </span>
          </p>
        ) : null}

        <div className="flex gap-1 rounded-xl bg-surface-container-low p-1">
          {(['user', 'investor'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRole(r);
                setPicked(null);
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${
                role === r ? 'bg-surface-container-lowest shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <Input
          label="Search name / email / phone"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Type to find a payer"
        />

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No matching active payers" icon="person_search" />
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {items.map((u) => {
              const selected = picked?._id === u._id;
              return (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => setPicked(u)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selected
                      ? 'border-primary bg-primary/10'
                      : 'border-outline-variant hover:bg-surface-container-low'
                  }`}
                >
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ''} · {u.role}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {error ? (
          <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!picked}
            loading={loading}
            onClick={() => picked && onAssign(picked._id)}
          >
            Assign
          </Button>
        </div>
      </div>
    </Modal>
  );
}
