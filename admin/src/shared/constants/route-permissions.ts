import { PERMISSIONS } from './permissions';

/** Path prefix → required permission (null = any admin/sub_admin). */
export const ROUTE_PERMISSIONS: { prefix: string; permission: string | null }[] = [
  { prefix: '/deposits', permission: PERMISSIONS.DEPOSITS },
  { prefix: '/cdm-requests', permission: PERMISSIONS.DEPOSITS },
  { prefix: '/my-deposits', permission: PERMISSIONS.DEPOSITS },
  { prefix: '/withdrawals', permission: PERMISSIONS.WITHDRAWALS },
  { prefix: '/my-withdrawals', permission: PERMISSIONS.WITHDRAWALS },
  { prefix: '/users', permission: PERMISSIONS.USERS },
  { prefix: '/businesses', permission: PERMISSIONS.BUSINESS },
  { prefix: '/wallet', permission: PERMISSIONS.WALLET },
  { prefix: '/commissions', permission: PERMISSIONS.COMMISSIONS },
  { prefix: '/audit', permission: PERMISSIONS.AUDIT },
  { prefix: '/support', permission: PERMISSIONS.SUPPORT },
  { prefix: '/payments', permission: PERMISSIONS.PAYMENT_CONFIG },
  { prefix: '/settings', permission: null },
  { prefix: '/transactions', permission: null },
  { prefix: '/', permission: null },
];

export function permissionForPath(pathname: string): string | null | undefined {
  const path = pathname.split('?')[0] || '/';
  // Longest prefix wins
  const matches = ROUTE_PERMISSIONS.filter(
    (r) => path === r.prefix || path.startsWith(`${r.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length);
  if (!matches.length) return undefined;
  return matches[0].permission;
}
