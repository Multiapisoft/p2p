'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import {
  platformSettingsApi,
  type PlatformSettings,
} from '@/features/settings/api/platform-settings.api';

const METHODS = [
  ['upi', 'UPI'],
  ['bank', 'Bank'],
  ['usdt', 'USDT'],
  ['cdm', 'CDM'],
] as const;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low/30 p-3 sm:p-4">
      <div>
        <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
        {description ? (
          <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 py-2.5">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-secondary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-on-surface-variant">{hint}</span> : null}
      </span>
    </label>
  );
}

function MethodGroup({
  title,
  selected,
  onChange,
}: {
  title: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {METHODS.map(([value, label]) => {
          const on = selected.includes(value);
          return (
            <button
              key={`${title}-${value}`}
              type="button"
              className={`rounded-full border px-3 py-1.5 text-xs font-medium sm:text-sm ${
                on
                  ? 'border-secondary bg-secondary-container'
                  : 'border-outline-variant hover:bg-surface-container-low'
              }`}
              onClick={() =>
                onChange(on ? selected.filter((m) => m !== value) : [...selected, value])
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlatformRulesPanel() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => platformSettingsApi.get(),
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
  const [refPeriodFrom, setRefPeriodFrom] = useState('');
  const [refPeriodTo, setRefPeriodTo] = useState('');
  const [refPeriodFirstReferrer, setRefPeriodFirstReferrer] = useState('0');
  const [refPeriodFirstJoiner, setRefPeriodFirstJoiner] = useState('0');
  const [refPeriodNextReferrer, setRefPeriodNextReferrer] = useState('0');
  const [refPeriodNextJoiner, setRefPeriodNextJoiner] = useState('0');
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
    setRefPeriodFrom(
      settings.investorReferralPeriodFromDate
        ? String(settings.investorReferralPeriodFromDate).slice(0, 10)
        : '',
    );
    setRefPeriodTo(
      settings.investorReferralPeriodToDate
        ? String(settings.investorReferralPeriodToDate).slice(0, 10)
        : '',
    );
    setRefPeriodFirstReferrer(
      String(settings.investorReferralPeriodFirstReferrerPercent ?? 0),
    );
    setRefPeriodFirstJoiner(String(settings.investorReferralPeriodFirstJoinerPercent ?? 0));
    setRefPeriodNextReferrer(String(settings.investorReferralPeriodNextReferrerPercent ?? 0));
    setRefPeriodNextJoiner(String(settings.investorReferralPeriodNextJoinerPercent ?? 0));
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
        investorReferralPeriodFromDate: refPeriodFrom.trim() || null,
        investorReferralPeriodToDate: refPeriodTo.trim() || null,
        investorReferralPeriodFirstReferrerPercent: Number(refPeriodFirstReferrer) || 0,
        investorReferralPeriodFirstJoinerPercent: Number(refPeriodFirstJoiner) || 0,
        investorReferralPeriodNextReferrerPercent: Number(refPeriodNextReferrer) || 0,
        investorReferralPeriodNextJoinerPercent: Number(refPeriodNextJoiner) || 0,
      };
      if (refPeriodFrom.trim() && refPeriodTo.trim() && refPeriodFrom > refPeriodTo) {
        throw new Error('Referral period: From date must be on or before To date');
      }
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

  return (
    <Card
      title="Platform rules"
      action={
        <Button
          type="button"
          size="sm"
          loading={saveSettings.isPending}
          disabled={isLoading}
          onClick={() => {
            setSettingsError('');
            setSettingsSuccess('');
            saveSettings.mutate();
          }}
        >
          Save
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading platform rules…</p>
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
          <Section
            title="Timing & limits"
            description="Hold times, TAT windows, and minimum transaction size."
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
                label="CDM hold before wide listing (minutes)"
                type="number"
                min={1}
                value={cdmHold}
                onChange={(e) => setCdmHold(e.target.value)}
              />
            </div>
          </Section>

          <Section
            title="Investor plans"
            description="Plan amounts and pay-target multiplier for investor onboarding."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Pay-target multiplier"
                type="number"
                min={1}
                step="0.01"
                value={planMultiplier}
                onChange={(e) => setPlanMultiplier(e.target.value)}
                required
              />
              <Input
                label="Plan amounts (comma-separated ₹)"
                value={planAmountsText}
                onChange={(e) => setPlanAmountsText(e.target.value)}
                placeholder="25000,50000,75000,100000,200000"
                required
              />
            </div>
            <p className="text-xs text-on-surface-variant">
              Investors pick a plan on first login, then can add more amounts (LIFO).
            </p>
          </Section>

          <Section
            title="Investor payment methods"
            description="Enable UPI, Bank, USDT, and CDM separately for deposits and withdrawals."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MethodGroup
                title="Deposits (P2P pay)"
                selected={investorDepositMethods}
                onChange={setInvestorDepositMethods}
              />
              <MethodGroup
                title="Withdrawals"
                selected={investorWdMethods}
                onChange={setInvestorWdMethods}
              />
            </div>
            <ToggleRow
              checked={allowMobileUpi}
              onChange={setAllowMobileUpi}
              label="Allow mobile-number UPI"
              hint="10 digits + @psp, e.g. 9876543210@paytm"
            />
          </Section>

          <Section title="Settlement & display">
            <div className="space-y-2">
              <ToggleRow
                checked={showCommissionToInvestor}
                onChange={setShowCommissionToInvestor}
                label="Show investor bonus / commission on pay list"
              />
              <ToggleRow
                checked={allowPartialPay}
                onChange={setAllowPartialPay}
                label="Allow partial withdrawal / deposit payments"
              />
              <ToggleRow
                checked={preferB2bSettlement}
                onChange={setPreferB2bSettlement}
                label="Prefer business / user withdrawals before investor"
                hint="B2B-first settlement order"
              />
            </div>
          </Section>

          <Section
            title="Investor referral rewards (%)"
            description="Paid from admin wallet as % of P2P pay principal when a referred investor completes a pay."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="mt-4 space-y-3 rounded-xl border border-outline-variant/70 bg-surface-container-low/40 p-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">Period bonus (optional)</p>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  During this date range, use the period % below for referrer and joiner instead of
                  the defaults above. Clear both dates to disable.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="From date"
                  type="date"
                  value={refPeriodFrom}
                  onChange={(e) => setRefPeriodFrom(e.target.value)}
                />
                <Input
                  label="To date"
                  type="date"
                  value={refPeriodTo}
                  onChange={(e) => setRefPeriodTo(e.target.value)}
                />
                <Input
                  label="Period first pay — referrer %"
                  type="number"
                  min={0}
                  step="0.01"
                  value={refPeriodFirstReferrer}
                  onChange={(e) => setRefPeriodFirstReferrer(e.target.value)}
                />
                <Input
                  label="Period first pay — joiner %"
                  type="number"
                  min={0}
                  step="0.01"
                  value={refPeriodFirstJoiner}
                  onChange={(e) => setRefPeriodFirstJoiner(e.target.value)}
                />
                <Input
                  label="Period next pays — referrer %"
                  type="number"
                  min={0}
                  step="0.01"
                  value={refPeriodNextReferrer}
                  onChange={(e) => setRefPeriodNextReferrer(e.target.value)}
                />
                <Input
                  label="Period next pays — joiner %"
                  type="number"
                  min={0}
                  step="0.01"
                  value={refPeriodNextJoiner}
                  onChange={(e) => setRefPeriodNextJoiner(e.target.value)}
                />
              </div>
            </div>
          </Section>

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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="submit" className="w-full sm:w-auto" loading={saveSettings.isPending}>
              Save platform rules
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
