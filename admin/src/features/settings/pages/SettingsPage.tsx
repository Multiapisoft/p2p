'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import type { User, Paginated } from '@/shared/types/api.types';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import {
  platformSettingsApi,
  type PlatformSettings,
} from '@/features/settings/api/platform-settings.api';

import { PERMISSIONS } from '@/shared/constants/permissions';

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const PLAN_PRESETS = [
  { label: '25k', value: 25000 },
  { label: '50k', value: 50000 },
  { label: '1L', value: 100000 },
  { label: '2L', value: 200000 },
];

function formatPlanAmount(n: number) {
  if (n >= 100000 && n % 100000 === 0) return `${n / 100000}L`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}k`;
  return String(n);
}

function parsePlanAmounts(raw: string): number[] {
  return raw
    .split(/[,|\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => {
      if (s.endsWith('l')) return Number(s.slice(0, -1)) * 100000;
      if (s.endsWith('k')) return Number(s.slice(0, -1)) * 1000;
      return Number(s.replace(/,/g, ''));
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perms, setperms] = useState<string[]>(['deposits.manage', 'withdrawals.manage']);

  const canManagePlatform =
    user?.role === 'admin' ||
    user?.permissions?.includes(PERMISSIONS.PLATFORM_SETTINGS);

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => platformSettingsApi.get(),
    enabled: !!canManagePlatform,
  });

  const [claimLock, setClaimLock] = useState('');
  const [paySubmit, setPaySubmit] = useState('');
  const [editTat, setEditTat] = useState('');
  const [planMultiplier, setPlanMultiplier] = useState('');
  const [planAmountsText, setPlanAmountsText] = useState('');
  const [planAmounts, setPlanAmounts] = useState<number[]>([]);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  useEffect(() => {
    if (!settings) return;
    setClaimLock(String(settings.investorClaimLockMinutes));
    setPaySubmit(String(settings.investorPaySubmitMinutes));
    setEditTat(String(settings.withdrawalUserEditTatMinutes));
    setPlanMultiplier(String(settings.investorPlanTargetMultiplier));
    setPlanAmounts(settings.investorPlanAmounts ?? []);
    setPlanAmountsText((settings.investorPlanAmounts ?? []).join(', '));
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () => {
      const amounts = planAmounts.length
        ? planAmounts
        : parsePlanAmounts(planAmountsText);
      if (!amounts.length) {
        throw new Error('Add at least one plan amount');
      }
      const body: Partial<PlatformSettings> = {
        investorClaimLockMinutes: Number(claimLock),
        investorPaySubmitMinutes: Number(paySubmit),
        withdrawalUserEditTatMinutes: Number(editTat),
        investorPlanTargetMultiplier: Number(planMultiplier),
        investorPlanAmounts: amounts,
      };
      return platformSettingsApi.update(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] });
      setSettingsError('');
      setSettingsSuccess('Platform rules saved');
    },
    onError: (err) => {
      setSettingsSuccess('');
      setSettingsError(getApiErrorMessage(err, 'Could not save platform rules'));
    },
  });

  function togglePlanAmount(value: number) {
    setPlanAmounts((prev) => {
      const next = prev.includes(value)
        ? prev.filter((x) => x !== value)
        : [...prev, value].sort((a, b) => a - b);
      setPlanAmountsText(next.join(', '));
      return next;
    });
  }

  function applyPlanAmountsFromText(raw: string) {
    setPlanAmountsText(raw);
    const parsed = parsePlanAmounts(raw);
    if (parsed.length) setPlanAmounts(parsed);
  }

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
        <p className="mt-0.5 text-sm text-on-surface-variant">Account & platform rules</p>
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

      {canManagePlatform && (
        <Card title="Platform rules">
          {loadingSettings ? (
            <p className="text-sm text-on-surface-variant">Loading…</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSettingsError('');
                setSettingsSuccess('');
                saveSettings.mutate();
              }}
            >
              <p className="text-sm text-on-surface-variant">
                Timers and investor plan defaults used across user and investor panels.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Investor claim lock (minutes)"
                  type="number"
                  min={1}
                  value={claimLock}
                  onChange={(e) => setClaimLock(e.target.value)}
                  required
                />
                <Input
                  label="Investor pay submit (minutes)"
                  type="number"
                  min={1}
                  value={paySubmit}
                  onChange={(e) => setPaySubmit(e.target.value)}
                  required
                />
                <Input
                  label="Withdrawal edit TAT (minutes)"
                  type="number"
                  min={1}
                  value={editTat}
                  onChange={(e) => setEditTat(e.target.value)}
                  required
                />
                <Input
                  label="Plan target multiplier"
                  type="number"
                  min={1}
                  step="0.01"
                  value={planMultiplier}
                  onChange={(e) => setPlanMultiplier(e.target.value)}
                  required
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Investor plan amounts</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {PLAN_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => togglePlanAmount(p.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        planAmounts.includes(p.value)
                          ? 'border-secondary bg-secondary-container'
                          : 'border-outline-variant'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {planAmounts.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {planAmounts.map((n) => (
                      <span
                        key={n}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-medium"
                      >
                        {formatPlanAmount(n)}
                        <button
                          type="button"
                          className="text-on-surface-variant hover:text-error"
                          onClick={() => togglePlanAmount(n)}
                          aria-label={`Remove ${n}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  label="Amounts (comma-separated)"
                  value={planAmountsText}
                  onChange={(e) => applyPlanAmountsFromText(e.target.value)}
                  placeholder="25000, 50000, 100000, 200000"
                />
              </div>

              {settingsError ? (
                <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                  {settingsError}
                </p>
              ) : null}
              {settingsSuccess ? (
                <p className="rounded-lg border border-secondary/30 bg-secondary/5 px-3 py-2 text-sm text-secondary">
                  {settingsSuccess}
                </p>
              ) : null}

              <Button type="submit" className="w-full sm:w-auto" loading={saveSettings.isPending}>
                Save platform rules
              </Button>
            </form>
          )}
        </Card>
      )}

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
