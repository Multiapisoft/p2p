'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import type { User, Paginated, Business } from '@/shared/types/api.types';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import {
  platformSettingsApi,
  type PlatformSettings,
} from '@/features/settings/api/platform-settings.api';
import { businessesApi } from '@/features/businesses/api/businesses.api';

import { TwoFactorPanel } from '@/features/settings/components/TwoFactorPanel';
import { PERMISSIONS } from '@/shared/constants/permissions';

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

function businessIdOf(id: string | { _id?: string } | undefined): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  return id._id || '';
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perms, setperms] = useState<string[]>(['deposits.manage', 'withdrawals.manage']);
  const [assignedBizIds, setAssignedBizIds] = useState<string[]>([]);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editBizIds, setEditBizIds] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [subError, setSubError] = useState('');

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
  const [planAmountsText, setPlanAmountsText] = useState('25000,50000,75000,100000,200000');
  const [allowMobileUpi, setAllowMobileUpi] = useState(false);
  const [investorDepositMethods, setInvestorDepositMethods] = useState<string[]>([
    'upi',
    'bank',
    'usdt',
    'cdm',
  ]);
  const [investorWdMethods, setInvestorWdMethods] = useState<string[]>([
    'upi',
    'bank',
    'usdt',
    'cdm',
  ]);
  const [showCommissionToInvestor, setShowCommissionToInvestor] = useState(true);
  const [allowPartialPay, setAllowPartialPay] = useState(true);
  const [preferB2bSettlement, setPreferB2bSettlement] = useState(true);
  const [cdmHold, setCdmHold] = useState('30');
  const [minTxn, setMinTxn] = useState('300');
  const [refFirstReferrer, setRefFirstReferrer] = useState('2');
  const [refFirstJoiner, setRefFirstJoiner] = useState('1');
  const [refNextReferrer, setRefNextReferrer] = useState('1');
  const [refNextJoiner, setRefNextJoiner] = useState('0');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  useEffect(() => {
    if (!settings) return;
    setClaimLock(String(settings.investorClaimLockMinutes));
    setPaySubmit(String(settings.investorPaySubmitMinutes));
    setEditTat(String(settings.withdrawalUserEditTatMinutes));
    setPlanMultiplier(String(settings.investorPlanTargetMultiplier));
    setPlanAmountsText(
      (settings.investorPlanAmounts?.length
        ? settings.investorPlanAmounts
        : [25000, 50000, 75000, 100000, 200000]
      ).join(','),
    );
    setAllowMobileUpi(!!settings.allowMobileNumberUpi);
    setInvestorDepositMethods(
      settings.investorAllowedDepositMethods?.length
        ? settings.investorAllowedDepositMethods
        : ['upi', 'bank', 'usdt', 'cdm'],
    );
    setInvestorWdMethods(
      settings.investorAllowedWithdrawalMethods?.length
        ? settings.investorAllowedWithdrawalMethods
        : ['upi', 'bank', 'usdt', 'cdm'],
    );
    setShowCommissionToInvestor(settings.showCommissionToInvestor !== false);
    setAllowPartialPay(settings.allowPartialPay !== false);
    setPreferB2bSettlement(settings.preferB2bSettlement !== false);
    setCdmHold(String(settings.cdmHoldMinutes ?? 30));
    setMinTxn(String(settings.minTransactionAmount ?? 300));
    setRefFirstReferrer(String(settings.investorReferralFirstReferrerPercent ?? 2));
    setRefFirstJoiner(String(settings.investorReferralFirstJoinerPercent ?? 1));
    setRefNextReferrer(String(settings.investorReferralNextReferrerPercent ?? 1));
    setRefNextJoiner(String(settings.investorReferralNextJoinerPercent ?? 0));
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () => {
      const minAmount = Number(minTxn);
      if (!Number.isFinite(minAmount) || minAmount < 300) {
        throw new Error('Minimum deposit / withdrawal must be ₹300');
      }
      const plans = planAmountsText
        .split(/[,\s]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!plans.length) {
        throw new Error('Enter at least one investor plan amount');
      }
      if (!investorDepositMethods.length) {
        throw new Error('Enable at least one investor deposit method');
      }
      if (!investorWdMethods.length) {
        throw new Error('Enable at least one investor withdrawal method');
      }
      const body: Partial<PlatformSettings> = {
        investorClaimLockMinutes: Number(claimLock),
        investorPaySubmitMinutes: Number(paySubmit),
        withdrawalUserEditTatMinutes: Number(editTat),
        investorPlanTargetMultiplier: Number(planMultiplier),
        investorPlanAmounts: plans,
        allowMobileNumberUpi: allowMobileUpi,
        investorAllowedDepositMethods: investorDepositMethods,
        investorAllowedWithdrawalMethods: investorWdMethods,
        showCommissionToInvestor,
        minTransactionAmount: minAmount,
        allowPartialPay,
        preferB2bSettlement,
        cdmHoldMinutes: Number(cdmHold) || 30,
        investorReferralFirstReferrerPercent: Number(refFirstReferrer) || 0,
        investorReferralFirstJoinerPercent: Number(refFirstJoiner) || 0,
        investorReferralNextReferrerPercent: Number(refNextReferrer) || 0,
        investorReferralNextJoinerPercent: Number(refNextJoiner) || 0,
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

  const { data: subAdmins } = useQuery({
    queryKey: ['sub-admins'],
    queryFn: () => apiGet<Paginated<User>>('/admin/sub-admins', { page: 1, limit: 100 }),
    enabled: user?.role === 'admin',
  });

  const { data: businessesData } = useQuery({
    queryKey: ['businesses-for-subadmin'],
    queryFn: () => businessesApi.list({ page: 1, limit: 200 }),
    enabled: user?.role === 'admin',
  });
  const businesses = (businessesData?.items ?? []) as Business[];

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

  const bizNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of businesses) map.set(b._id, b.name);
    return map;
  }, [businesses]);

  const createSubAdmin = useMutation({
    mutationFn: () =>
      apiPost('/admin/sub-admins', {
        name,
        email,
        password,
        permissions: perms,
        assignedBusinessIds: assignedBizIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-admins'] });
      setName('');
      setEmail('');
      setPassword('');
      setAssignedBizIds([]);
      setSubError('');
    },
    onError: (err) => setSubError(getApiErrorMessage(err, 'Could not create sub-admin')),
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
    },
    onError: (err) => setSubError(getApiErrorMessage(err, 'Could not update sub-admin')),
  });

  function toggleBiz(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Settings</h1>
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

      <TwoFactorPanel />

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
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Pay hold for others (minutes)"
                  type="number"
                  min={1}
                  value={claimLock}
                  onChange={(e) => setClaimLock(e.target.value)}
                  required
                />
                <Input
                  label="Payer submit TAT (minutes)"
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
                  label="Min deposit / withdrawal (₹)"
                  type="number"
                  min={300}
                  value={minTxn}
                  onChange={(e) => setMinTxn(e.target.value)}
                  required
                />
                <Input
                  label="Investor pay-target multiplier"
                  type="number"
                  min={1}
                  step="0.01"
                  value={planMultiplier}
                  onChange={(e) => setPlanMultiplier(e.target.value)}
                  required
                />
                <Input
                  label="Investor plan amounts (comma-separated ₹)"
                  value={planAmountsText}
                  onChange={(e) => setPlanAmountsText(e.target.value)}
                  placeholder="25000,50000,75000,100000,200000"
                  required
                />
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={allowMobileUpi}
                  onChange={(e) => setAllowMobileUpi(e.target.checked)}
                />
                <span>
                  Allow mobile-number UPI (10 digits + @psp, e.g. 9876543210@paytm)
                </span>
              </label>

              <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low/40 p-3">
                <p className="text-sm font-semibold">Investor payment methods</p>
                <p className="text-xs text-on-surface-variant">
                  Enable or disable UPI, Bank, USDT, and CDM separately for investor deposits
                  (P2P pay) and withdrawals.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                      Deposits (P2P pay)
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {(
                        [
                          ['upi', 'UPI'],
                          ['bank', 'Bank'],
                          ['usdt', 'USDT'],
                          ['cdm', 'CDM'],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={`dep-${value}`} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={investorDepositMethods.includes(value)}
                            onChange={(e) => {
                              setInvestorDepositMethods((prev) => {
                                if (e.target.checked) {
                                  return prev.includes(value) ? prev : [...prev, value];
                                }
                                return prev.filter((m) => m !== value);
                              });
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                      Withdrawals
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {(
                        [
                          ['upi', 'UPI'],
                          ['bank', 'Bank'],
                          ['usdt', 'USDT'],
                          ['cdm', 'CDM'],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={`wd-${value}`} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={investorWdMethods.includes(value)}
                            onChange={(e) => {
                              setInvestorWdMethods((prev) => {
                                if (e.target.checked) {
                                  return prev.includes(value) ? prev : [...prev, value];
                                }
                                return prev.filter((m) => m !== value);
                              });
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={showCommissionToInvestor}
                  onChange={(e) => setShowCommissionToInvestor(e.target.checked)}
                />
                <span>Show investor bonus / commission on pay list</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={allowPartialPay}
                  onChange={(e) => setAllowPartialPay(e.target.checked)}
                />
                <span>Allow partial withdrawal / deposit payments</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={preferB2bSettlement}
                  onChange={(e) => setPreferB2bSettlement(e.target.checked)}
                />
                <span>Prefer business / user withdrawals before investor (B2B-first)</span>
              </label>
              <Input
                label="CDM hold before wide listing (minutes)"
                type="number"
                min={1}
                value={cdmHold}
                onChange={(e) => setCdmHold(e.target.value)}
              />

              <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-3 sm:p-4">
                <p className="text-sm font-semibold">Investor referral plan (%)</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  When a referred investor completes a P2P pay, rewards are paid from the admin
                  wallet as a % of that pay principal. First pay vs later pays use different rates.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="First pay — referrer %"
                    type="number"
                    min={0}
                    step="0.01"
                    value={refFirstReferrer}
                    onChange={(e) => setRefFirstReferrer(e.target.value)}
                  />
                  <Input
                    label="First pay — joiner %"
                    type="number"
                    min={0}
                    step="0.01"
                    value={refFirstJoiner}
                    onChange={(e) => setRefFirstJoiner(e.target.value)}
                  />
                  <Input
                    label="Next pays — referrer %"
                    type="number"
                    min={0}
                    step="0.01"
                    value={refNextReferrer}
                    onChange={(e) => setRefNextReferrer(e.target.value)}
                  />
                  <Input
                    label="Next pays — joiner %"
                    type="number"
                    min={0}
                    step="0.01"
                    value={refNextJoiner}
                    onChange={(e) => setRefNextJoiner(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-xs text-on-surface-variant">
                Investors choose a plan (25k / 50k / 75k / 1L / 2L, editable below) on first login,
                then can add more amounts (LIFO).
              </p>

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
            <div>
              <p className="mb-2 text-sm font-semibold">Businesses they can control</p>
              <p className="mb-2 text-xs text-on-surface-variant">
                Sub-admin only sees deposits, withdrawals, commissions, and transactions for these
                businesses.
              </p>
              {businesses.length ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-outline-variant p-2">
                  {businesses.map((b) => (
                    <label
                      key={b._id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-container-low"
                    >
                      <input
                        type="checkbox"
                        checked={assignedBizIds.includes(b._id)}
                        onChange={() => toggleBiz(assignedBizIds, b._id, setAssignedBizIds)}
                      />
                      <span className="min-w-0 truncate">
                        {b.name}
                        {b.referralCode ? (
                          <span className="text-on-surface-variant"> · {b.referralCode}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant">No businesses yet.</p>
              )}
            </div>
            {subError && !editTarget ? (
              <p className="rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                {subError}
              </p>
            ) : null}
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
                <div className="space-y-2">
                  {filteredSubs.map((s) => {
                    const bizIds = (s.assignedBusinessIds || []).map((id) => businessIdOf(id));
                    return (
                      <div
                        key={s._id}
                        className="flex flex-col gap-2 rounded-xl border border-outline-variant/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {s.name}{' '}
                            <span className="font-normal text-on-surface-variant">({s.email})</span>
                          </p>
                          <p className="mt-0.5 text-xs text-on-surface-variant">
                            {s.permissions?.length ?? 0} perms ·{' '}
                            {bizIds.length
                              ? bizIds.map((id) => bizNameById.get(id) || id.slice(-6)).join(', ')
                              : 'No businesses'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditTarget(s);
                            setEditName(s.name);
                            setEditPerms([...(s.permissions || [])]);
                            setEditBizIds(bizIds);
                            setEditPassword('');
                            setSubError('');
                          }}
                        >
                          Edit rights
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">No matches</p>
              )}
            </div>
          ) : null}
        </Card>
      )}

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
            />
            <div>
              <p className="mb-2 text-sm font-semibold">Permissions</p>
              <div className="chip-scroll">
                {ALL_PERMISSIONS.map((p) => (
                  <label
                    key={p}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] sm:px-3 sm:text-xs ${
                      editPerms.includes(p)
                        ? 'border-secondary bg-secondary-container'
                        : 'border-outline-variant'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={editPerms.includes(p)}
                      onChange={() =>
                        setEditPerms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                        )
                      }
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Businesses they can control</p>
              {businesses.length ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-outline-variant p-2">
                  {businesses.map((b) => (
                    <label
                      key={b._id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-container-low"
                    >
                      <input
                        type="checkbox"
                        checked={editBizIds.includes(b._id)}
                        onChange={() => toggleBiz(editBizIds, b._id, setEditBizIds)}
                      />
                      <span className="min-w-0 truncate">{b.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant">No businesses yet.</p>
              )}
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
