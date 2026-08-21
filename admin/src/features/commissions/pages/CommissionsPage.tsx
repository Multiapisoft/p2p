'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commissionsApi } from '../api/commissions.api';
import { businessesApi } from '@/features/businesses/api/businesses.api';
import { usersApi } from '@/features/users/api/users.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useMemo, useState } from 'react';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { Commission } from '@/shared/types/api.types';

const SELECT_CLASS =
  'w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm sm:px-4 sm:py-2.5';

export function CommissionsPage() {
  const { isAdmin } = usePermissions();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Commission | null>(null);
  const [editPercentage, setEditPercentage] = useState('');
  const [editFixedFee, setEditFixedFee] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [targetType, setTargetType] = useState('platform');
  const [targetId, setTargetId] = useState('');
  const [percentage, setPercentage] = useState('2');
  const [fixedFee, setFixedFee] = useState('0');
  const [description, setDescription] = useState('');
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['commissions'],
    queryFn: () => commissionsApi.getAll(),
  });

  const { data: businesses } = useQuery({
    queryKey: ['commission-businesses'],
    queryFn: () => businessesApi.list({ page: 1, limit: 100 }),
    enabled: isAdmin,
  });

  const { data: investors } = useQuery({
    queryKey: ['commission-investors'],
    queryFn: () => usersApi.list({ page: 1, limit: 100, role: 'investor' }),
    enabled: isAdmin,
  });

  const businessMap = useMemo(
    () => Object.fromEntries((businesses?.items ?? []).map((b) => [b._id, b.name])),
    [businesses],
  );
  const investorMap = useMemo(
    () =>
      Object.fromEntries(
        (investors?.items ?? []).map((u) => [u._id, u.name || u.email]),
      ),
    [investors],
  );

  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (typeFilter !== 'all' && c.targetType !== typeFilter) return false;
      if (!q) return true;
      const label = [
        c.targetType,
        c.description,
        c.targetId ? businessMap[c.targetId] || investorMap[c.targetId] || c.targetId : '',
      ]
        .join(' ')
        .toLowerCase();
      return label.includes(q);
    });
  }, [data, typeFilter, searchInput, businessMap, investorMap]);

  const resetCreateForm = () => {
    setTargetType('platform');
    setTargetId('');
    setPercentage('2');
    setFixedFee('0');
    setDescription('');
  };

  const create = useMutation({
    mutationFn: () =>
      commissionsApi.create({
        targetType,
        targetId: targetType === 'platform' ? undefined : targetId || undefined,
        percentage: Number(percentage),
        fixedFee: Number(fixedFee),
        description,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commissions'] });
      setShowCreate(false);
      resetCreateForm();
    },
  });

  const update = useMutation({
    mutationFn: (body: { percentage?: number; fixedFee?: number; isActive?: boolean }) =>
      commissionsApi.update(editTarget!._id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commissions'] });
      setEditTarget(null);
    },
  });

  const targetLabel = (c: Commission) => {
    if (c.targetType === 'platform') return 'Platform (global)';
    if (!c.targetId) {
      return c.targetType === 'business'
        ? 'All businesses (default)'
        : 'All investors (default)';
    }
    if (c.targetType === 'business') {
      return `Business: ${businessMap[c.targetId] ?? c.targetId}`;
    }
    return `Investor: ${investorMap[c.targetId] ?? c.targetId}`;
  };

  const directionHint = (type: string) => {
    if (type === 'business') {
      return 'Collected to admin wallet on deposit/withdrawal, with the related transaction';
    }
    if (type === 'investor') return 'Applied to investor on redemption';
    return 'Platform fee collected to admin wallet on deposit/withdrawal';
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Commissions</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">Platform, business & investor fee configuration</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CsvDownloadButton<Commission>
            title="Commissions"
            filename="commissions"
            filters={{ Type: typeFilter, Search: searchInput }}
            disabled={!filtered.length}
            columns={[
              { header: 'Target type', value: (c) => c.targetType },
              { header: 'Target', value: (c) => targetLabel(c) },
              { header: 'Fee mode', value: (c) => c.feeMode || '' },
              { header: 'Percentage', value: (c) => c.percentage },
              { header: 'Fixed fee', value: (c) => c.fixedFee },
              { header: 'Active', value: (c) => (c.isActive ? 'yes' : 'no') },
              { header: 'Description', value: (c) => c.description || '' },
            ]}
            fetchRows={async () => filtered}
          />
          {isAdmin && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                resetCreateForm();
                setShowCreate(true);
              }}
            >
              Add Commission
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total configs
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{data?.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Showing
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Active
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">
            {filtered.filter((c) => c.isActive).length}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <Input
            placeholder="Search target, description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div className="chip-scroll">
            {[
              { value: 'all', label: 'All types' },
              { value: 'platform', label: 'Platform' },
              { value: 'business', label: 'Business' },
              { value: 'investor', label: 'Investor' },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTypeFilter(t.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm ${
                  typeFilter === t.value ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <LoadingScreen />
        ) : !filtered.length ? (
          <EmptyState message="No commission configs match filters" icon="percent" />
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {filtered.map((c) => (
              <div
                key={c._id}
                className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3 sm:rounded-xl sm:p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{targetLabel(c)}</p>
                  <p className="text-xs text-on-surface-variant sm:text-sm">
                    {c.description || directionHint(c.targetType)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <span className="font-bold text-secondary">{c.percentage}%</span>
                  {c.fixedFee > 0 && <span className="text-sm">+ {c.fixedFee} fixed</span>}
                  <StatusBadge status={c.isActive ? 'active' : 'suspended'} />
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditTarget(c);
                        setEditPercentage(String(c.percentage));
                        setEditFixedFee(String(c.fixedFee));
                        setEditActive(c.isActive);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Commission">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <p className="mb-2 text-sm font-semibold">Target Type</p>
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value);
                setTargetId('');
              }}
              className={SELECT_CLASS}
            >
              <option value="platform">Platform (global)</option>
              <option value="business">Business</option>
              <option value="investor">Investor</option>
            </select>
            <p className="mt-1 text-xs text-on-surface-variant">{directionHint(targetType)}</p>
          </div>

          {targetType === 'business' && (
            <div>
              <p className="mb-2 text-sm font-semibold">Business</p>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">All businesses (default rate)</option>
                {(businesses?.items ?? []).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'investor' && (
            <div>
              <p className="mb-2 text-sm font-semibold">Investor</p>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">All investors (default rate)</option>
                {(investors?.items ?? []).map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input label="Percentage" type="number" min={0} max={100} value={percentage} onChange={(e) => setPercentage(e.target.value)} required />
          <Input label="Fixed Fee" type="number" min={0} value={fixedFee} onChange={(e) => setFixedFee(e.target.value)} />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button type="submit" loading={create.isPending} className="w-full">Create</Button>
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Commission">
        {editTarget && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({
                percentage: Number(editPercentage),
                fixedFee: Number(editFixedFee),
                isActive: editActive,
              });
            }}
          >
            <p className="text-sm text-on-surface-variant">{targetLabel(editTarget)}</p>
            <Input label="Percentage" type="number" value={editPercentage} onChange={(e) => setEditPercentage(e.target.value)} />
            <Input label="Fixed Fee" type="number" value={editFixedFee} onChange={(e) => setEditFixedFee(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              Active
            </label>
            <Button type="submit" loading={update.isPending} className="w-full">Save</Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
