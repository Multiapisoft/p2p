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
  { value: 'bank', label: 'Bank' },
  { value: 'usdt', label: 'USDT' },
  { value: 'cdm', label: 'CDM' },
];

/** Non-business users: P2P pay defaults (no CDM until business enables it). */
const DEFAULT_USER_P2P_METHODS: PaymentMethod[] = ['upi', 'bank', 'usdt'];

export function resolveUserDepositMethods(
  allowed?: PaymentMethod[] | null,
): PaymentMethod[] {
  if (allowed?.length) return allowed;
  return DEFAULT_USER_P2P_METHODS;
}

export function resolveUserWithdrawalMethods(
  allowed?: PaymentMethod[] | null,
): PaymentMethod[] {
  if (allowed?.length) return allowed;
  return DEFAULT_USER_P2P_METHODS;
}

export function filterDepositMethodTabs(allowed: PaymentMethod[]) {
  return DEPOSIT_METHOD_TABS.filter(
    (t) => t.value === 'all' || allowed.includes(t.value),
  );
}

export function filterWithdrawalMethodOptions(allowed: PaymentMethod[]) {
  return WITHDRAWAL_METHOD_OPTIONS.filter((m) => allowed.includes(m.value));
}

export function isDepositMethodEnabled(
  method: PaymentMethod,
  allowed: PaymentMethod[],
): boolean {
  return allowed.includes(method);
}
