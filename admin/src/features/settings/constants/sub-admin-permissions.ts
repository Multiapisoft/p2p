import { PERMISSIONS } from '@/shared/constants/permissions';

export const MODULE_PERMISSIONS = [
  { value: PERMISSIONS.DEPOSITS, label: 'Deposits' },
  { value: PERMISSIONS.WITHDRAWALS, label: 'Withdrawals' },
  { value: PERMISSIONS.USERS, label: 'Users' },
  { value: PERMISSIONS.BUSINESS, label: 'Business' },
  { value: PERMISSIONS.COMMISSIONS, label: 'Commissions' },
  { value: PERMISSIONS.SUPPORT, label: 'Support' },
  { value: PERMISSIONS.PAYMENT_CONFIG, label: 'Payment config' },
  { value: PERMISSIONS.AUDIT, label: 'Audit' },
  { value: PERMISSIONS.WALLET, label: 'Wallet' },
  { value: PERMISSIONS.PLATFORM_SETTINGS, label: 'Platform settings' },
] as const;

export const LOGIN_AS_PERMISSIONS = [
  { value: PERMISSIONS.LOGIN_AS_USER, label: 'Login as user' },
  { value: PERMISSIONS.LOGIN_AS_INVESTOR, label: 'Login as investor' },
  { value: PERMISSIONS.LOGIN_AS_BUSINESS, label: 'Login as business' },
] as const;

export const DEFAULT_SUB_ADMIN_PERMS = [
  PERMISSIONS.DEPOSITS,
  PERMISSIONS.WITHDRAWALS,
] as const;

export function permissionLabel(value: string): string {
  const hit =
    MODULE_PERMISSIONS.find((p) => p.value === value) ||
    LOGIN_AS_PERMISSIONS.find((p) => p.value === value);
  return hit?.label ?? value;
}

export function businessIdOf(id: string | { _id?: string } | undefined): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  return id._id || '';
}
