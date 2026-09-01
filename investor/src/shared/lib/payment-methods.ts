import type { PaymentMethod } from '@/shared/types/api.types';

export const DEPOSIT_METHOD_TABS: { value: PaymentMethod | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
  { value: 'cdm', label: 'CDM' },
];

export const WITHDRAWAL_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'usdt', label: 'USDT' },
];

const DEFAULT_INVESTOR_METHODS: PaymentMethod[] = ['upi', 'bank', 'usdt', 'cdm'];

export function resolveInvestorDepositMethods(
  allowed?: PaymentMethod[] | null,
): PaymentMethod[] {
  if (allowed?.length) return allowed;
  return DEFAULT_INVESTOR_METHODS;
}

export function resolveInvestorWithdrawalMethods(
  allowed?: PaymentMethod[] | null,
): PaymentMethod[] {
  if (allowed?.length) return allowed;
  return DEFAULT_INVESTOR_METHODS.filter((m) =>
    WITHDRAWAL_METHOD_OPTIONS.some((o) => o.value === m),
  );
}

export function filterDepositMethodTabs(allowed: PaymentMethod[]) {
  return DEPOSIT_METHOD_TABS.filter(
    (t) => t.value === 'all' || allowed.includes(t.value),
  );
}

export function filterWithdrawalMethodOptions(allowed: PaymentMethod[]) {
  return WITHDRAWAL_METHOD_OPTIONS.filter((m) => allowed.includes(m.value));
}
