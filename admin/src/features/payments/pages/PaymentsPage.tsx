'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../api/payments.api';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatCurrency } from '@/shared/lib/utils';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useMemo, useState } from 'react';
import { CsvDownloadButton } from '@/shared/components/CsvDownloadButton';
import type { PaymentConfig } from '@/shared/types/api.types';

export function PaymentsPage() {
  const { isAdmin } = usePermissions();
  const [showCreate, setShowCreate] = useState(false);
  const [method, setMethod] = useState('upi');
  const [label, setLabel] = useState('');
  const [detailKey, setDetailKey] = useState('upiId');
  const [detailValue, setDetailValue] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['payment-config'],
    queryFn: () => paymentsApi.getAll(),
  });

  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'inactive' && p.isActive) return false;
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q) ||
        Object.values(p.details).some((v) => String(v).toLowerCase().includes(q))
      );
    });
  }, [data, methodFilter, statusFilter, searchInput]);

  const create = useMutation({
    mutationFn: () =>
      paymentsApi.create({
        method,
        label,
        currency: method === 'usdt' ? 'usdt' : 'inr',
        minAmount: 100,
        maxAmount: 500000,
        details: { [detailKey]: detailValue },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-config'] });
      setShowCreate(false);
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      paymentsApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-config'] }),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Payment Methods</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">Platform UPI, Bank & USDT receiving accounts</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CsvDownloadButton<PaymentConfig>
            title="Payment methods"
            filename="payment-methods"
            filters={{ Method: methodFilter, Status: statusFilter, Search: searchInput }}
            disabled={!filtered.length}
            columns={[
              { header: 'Label', value: (p) => p.label },
              { header: 'Method', value: (p) => p.method },
              { header: 'Currency', value: (p) => p.currency },
              { header: 'Active', value: (p) => (p.isActive ? 'yes' : 'no') },
              { header: 'Min', value: (p) => p.minAmount },
              { header: 'Max', value: (p) => p.maxAmount },
              {
                header: 'Details',
                value: (p) =>
                  Object.entries(p.details || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('; '),
              },
            ]}
            fetchRows={async () => filtered}
          />
          {isAdmin && (
            <Button className="w-full sm:w-auto" onClick={() => setShowCreate(true)}>
              Add Method
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total
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
            {filtered.filter((p) => p.isActive).length}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <Input
            placeholder="Search label or details…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div className="chip-scroll">
            {[
              { value: 'all', label: 'All methods' },
              { value: 'upi', label: 'UPI' },
              { value: 'bank', label: 'Bank' },
              { value: 'usdt', label: 'USDT' },
            ].map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethodFilter(m.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm ${
                  methodFilter === m.value ? 'bg-primary text-on-primary' : 'border border-outline-variant'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="chip-scroll">
            {[
              { value: 'all', label: 'All status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ].map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatusFilter(s.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-sm ${
                  statusFilter === s.value ? 'bg-secondary text-on-secondary' : 'border border-outline-variant'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <LoadingScreen />
        ) : !filtered.length ? (
          <EmptyState message="No payment configs match filters" icon="payments" />
        ) : (
          filtered.map((p) => (
            <Card key={p._id}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="min-w-0 truncate font-semibold">{p.label}</h3>
                <StatusBadge status={p.isActive ? 'active' : 'suspended'} />
              </div>
              <p className="mt-1 text-sm capitalize text-on-surface-variant">
                {p.method} • {p.currency}
              </p>
              <div className="mt-3 space-y-1.5 text-sm sm:mt-4 sm:space-y-2">
                <p>
                  Limits: {formatCurrency(p.minAmount, p.currency)} —{' '}
                  {formatCurrency(p.maxAmount, p.currency)}
                </p>
                {Object.entries(p.details).map(([k, v]) => (
                  <p key={k} className="truncate text-on-surface-variant">
                    <span className="font-medium capitalize">{k}:</span> {v}
                  </p>
                ))}
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full sm:mt-4"
                  onClick={() =>
                    toggleActive.mutate({ id: p._id, isActive: !p.isActive })
                  }
                >
                  {p.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </Card>
          ))
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Payment Method">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <p className="mb-2 text-sm font-semibold">Method</p>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                if (e.target.value === 'upi') setDetailKey('upiId');
                else if (e.target.value === 'bank') setDetailKey('accountNumber');
                else setDetailKey('walletAddress');
              }}
              className="w-full rounded-lg border border-outline-variant px-2.5 py-2 text-sm sm:px-4 sm:py-2.5"
            >
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
              <option value="usdt">USDT</option>
            </select>
          </div>
          <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} required />
          <Input label="Detail Key" value={detailKey} onChange={(e) => setDetailKey(e.target.value)} />
          <Input label="Detail Value" value={detailValue} onChange={(e) => setDetailValue(e.target.value)} required />
          <Button type="submit" loading={create.isPending} className="w-full">Create</Button>
        </form>
      </Modal>
    </div>
  );
}
