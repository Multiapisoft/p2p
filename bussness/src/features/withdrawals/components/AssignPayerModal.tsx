'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/features/users/api/users.api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { resolveUser } from '@/shared/lib/entity-user';
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
    }
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['assign-payer-business-users', search],
    queryFn: () =>
      usersApi.getBusinessUsers({
        page: 1,
        limit: 8,
        status: 'active',
        search,
        sort: 'newest',
      }),
    enabled: open,
  });

  const current = resolveUser(withdrawal?.assignedTo);
  const owner = resolveUser(withdrawal?.userId);
  const items = (data?.items ?? []).filter((u) => (u._id || u.userId) !== owner.id);

  return (
    <Modal open={open} onClose={onClose} title="Assign to your user" className="sm:max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-on-surface-variant">
          Only assigned payer can submit proof.
        </p>
        {current.id ? (
          <p className="rounded-xl bg-secondary-container/40 px-3 py-2 text-sm">
            Currently assigned: <span className="font-semibold">{current.name}</span>
            {current.email ? ` · ${current.email}` : ''}
          </p>
        ) : null}

        <Input
          label="Search your users"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Name, email, or user code"
        />

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState message="No matching users" icon="person_search" />
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {items.map((u) => {
              const id = u._id || u.userId || '';
              const selected = picked && (picked._id || picked.userId) === id;
              return (
                <button
                  key={id}
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
                    {u.phone ? ` · ${u.phone}` : ''}
                    {u.businessUserCode ? ` · ${u.businessUserCode}` : ''}
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
            onClick={() => {
              const id = picked?._id || picked?.userId;
              if (id) onAssign(id);
            }}
          >
            Assign
          </Button>
        </div>
      </div>
    </Modal>
  );
}
