import { Permission } from '../enums/permission.enum';

export const BUSINESS_STAFF_PERMISSIONS = [
  Permission.BUSINESS_DEPOSIT_VERIFY,
  Permission.BUSINESS_WITHDRAWALS,
  Permission.BUSINESS_MANUAL_WITHDRAWAL,
] as const;

export type BusinessStaffPermission = (typeof BUSINESS_STAFF_PERMISSIONS)[number];

export function isBusinessStaffPermission(value: string): value is BusinessStaffPermission {
  return (BUSINESS_STAFF_PERMISSIONS as readonly string[]).includes(value);
}

export function sanitizeBusinessStaffPermissions(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter(isBusinessStaffPermission))];
}

/** Owner always allowed. Staff need the exact permission. */
export function staffHasPermission(opts: {
  isOwner: boolean;
  permissions?: string[] | null;
  need: string;
}): boolean {
  if (opts.isOwner) return true;
  return (opts.permissions ?? []).includes(opts.need);
}

export function isBusinessOwner(user: {
  role?: string;
  staffBusinessId?: unknown;
}): boolean {
  return user.role === 'business' && !user.staffBusinessId;
}
