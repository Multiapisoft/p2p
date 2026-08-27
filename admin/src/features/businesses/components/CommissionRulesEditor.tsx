'use client';

import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import type { CommissionFeeMode, CommissionRuleInput } from '@/shared/types/api.types';

const SELECT_CLASS =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm';

export function emptyRule(partial?: Partial<CommissionRuleInput>): CommissionRuleInput {
  return {
    feeMode: 'percentage',
    percentage: 2,
    fixedFee: 0,
    useRange: false,
    minAmount: 0,
    maxAmount: 100000,
    isActive: true,
    ...partial,
  };
}

export function rulesFromConfigs(
  configs: {
    feeMode?: string;
    percentage: number;
    fixedFee: number;
    minAmount?: number;
    maxAmount?: number;
    description?: string;
    isActive: boolean;
  }[],
): CommissionRuleInput[] {
  if (!configs.length) return [emptyRule()];
  return configs.map((c) => ({
    feeMode: (c.feeMode as CommissionFeeMode) || (c.fixedFee > 0 && c.percentage > 0 ? 'both' : c.fixedFee > 0 ? 'fixed' : 'percentage'),
    percentage: c.percentage,
    fixedFee: c.fixedFee,
    useRange: c.minAmount != null || c.maxAmount != null,
    minAmount: c.minAmount ?? 0,
    maxAmount: c.maxAmount ?? 100000,
    description: c.description,
    isActive: c.isActive,
  }));
}

interface CommissionRulesEditorProps {
  title: string;
  hint?: string;
  rules: CommissionRuleInput[];
  onChange: (rules: CommissionRuleInput[]) => void;
}

export function CommissionRulesEditor({ title, hint, rules, onChange }: CommissionRulesEditorProps) {
  const update = (index: number, patch: Partial<CommissionRuleInput>) => {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const remove = (index: number) => {
    if (rules.length <= 1) {
      onChange([emptyRule({ feeMode: rules[0]?.feeMode, percentage: 0, fixedFee: 0 })]);
      return;
    }
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {hint?.trim() ? (
          <p className="text-xs text-on-surface-variant">{hint}</p>
        ) : null}
      </div>

      {rules.map((rule, index) => (
        <div
          key={index}
          className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-low/40 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Rule {index + 1}
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-error"
              onClick={() => remove(index)}
            >
              Remove
            </button>
          </div>

          <label className="block text-xs font-semibold">
            Fee type
            <select
              className={`mt-1 ${SELECT_CLASS}`}
              value={rule.feeMode}
              onChange={(e) => update(index, { feeMode: e.target.value as CommissionFeeMode })}
            >
              <option value="percentage">Percentage only (%)</option>
              <option value="fixed">Fixed only (₹)</option>
              <option value="both">Percentage + Fixed</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            {(rule.feeMode === 'percentage' || rule.feeMode === 'both') && (
              <Input
                label="Percentage %"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={String(rule.percentage)}
                onChange={(e) => update(index, { percentage: Number(e.target.value) || 0 })}
              />
            )}
            {(rule.feeMode === 'fixed' || rule.feeMode === 'both') && (
              <Input
                label="Fixed ₹"
                type="number"
                min={0}
                step="0.01"
                value={String(rule.fixedFee)}
                onChange={(e) => update(index, { fixedFee: Number(e.target.value) || 0 })}
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={!!rule.useRange}
              onChange={(e) => update(index, { useRange: e.target.checked })}
            />
            Amount range (optional)
          </label>

          {rule.useRange && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Min amount"
                type="number"
                min={0}
                value={String(rule.minAmount ?? 0)}
                onChange={(e) => update(index, { minAmount: Number(e.target.value) || 0 })}
              />
              <Input
                label="Max amount"
                type="number"
                min={0}
                value={String(rule.maxAmount ?? 0)}
                onChange={(e) => update(index, { maxAmount: Number(e.target.value) || 0 })}
              />
            </div>
          )}
        </div>
      ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => onChange([...rules, emptyRule()])}
      >
        Add rule / range tier
      </Button>
    </div>
  );
}
