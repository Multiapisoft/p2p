/**
 * Pure helper mirroring admin route permission map — kept in backend test suite
 * so CI verifies the same rules without needing an admin Jest project.
 */
import { Permission } from '../enums/permission.enum';

const PERMISSIONS = {
  DEPOSITS: Permission.DEPOSITS_MANAGE,
  WITHDRAWALS: Permission.WITHDRAWALS_MANAGE,
  USERS: Permission.USERS_MANAGE,
  BUSINESS: Permission.BUSINESS_MANAGE,
  COMMISSIONS: Permission.COMMISSIONS_MANAGE,
  SUPPORT: Permission.SUPPORT_MANAGE,
  PAYMENT_CONFIG: Permission.PAYMENT_CONFIG_MANAGE,
  AUDIT: Permission.AUDIT_VIEW,
  WALLET: Permission.WALLET_ADJUST,
} as const;

const ROUTE_PERMISSIONS: { prefix: string; permission: string | null }[] = [
  { prefix: '/deposits', permission: PERMISSIONS.DEPOSITS },
  { prefix: '/cdm-requests', permission: PERMISSIONS.DEPOSITS },
  { prefix: '/my-deposits', permission: PERMISSIONS.DEPOSITS },
  { prefix: '/withdrawals', permission: PERMISSIONS.WITHDRAWALS },
  { prefix: '/my-withdrawals', permission: PERMISSIONS.WITHDRAWALS },
  { prefix: '/users', permission: PERMISSIONS.USERS },
  { prefix: '/businesses', permission: PERMISSIONS.BUSINESS },
  { prefix: '/wallet', permission: PERMISSIONS.WALLET },
  { prefix: '/audit', permission: PERMISSIONS.AUDIT },
  { prefix: '/support', permission: PERMISSIONS.SUPPORT },
  { prefix: '/payments', permission: PERMISSIONS.PAYMENT_CONFIG },
  { prefix: '/settings', permission: null },
  { prefix: '/transactions', permission: null },
  { prefix: '/', permission: null },
];

function permissionForPath(pathname: string): string | null | undefined {
  const path = pathname.split('?')[0] || '/';
  const matches = ROUTE_PERMISSIONS.filter(
    (r) => path === r.prefix || path.startsWith(`${r.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length);
  if (!matches.length) return undefined;
  return matches[0].permission;
}

function canOpenRoute(
  pathname: string,
  opts: { role: 'admin' | 'sub_admin'; permissions: string[] },
) {
  if (opts.role === 'admin') return true;
  const required = permissionForPath(pathname);
  if (required === undefined) return true;
  if (required === null) return true;
  return opts.permissions.includes(required);
}

describe('admin route permission gates — complex nav scenarios', () => {
  const depositsOnly = {
    role: 'sub_admin' as const,
    permissions: [PERMISSIONS.DEPOSITS],
  };

  it('deposits-only sub-admin can open deposits + CDM but not withdrawals', () => {
    expect(canOpenRoute('/deposits', depositsOnly)).toBe(true);
    expect(canOpenRoute('/deposits?status=pending', depositsOnly)).toBe(true);
    expect(canOpenRoute('/cdm-requests', depositsOnly)).toBe(true);
    expect(canOpenRoute('/my-deposits', depositsOnly)).toBe(true);
    expect(canOpenRoute('/withdrawals', depositsOnly)).toBe(false);
    expect(canOpenRoute('/my-withdrawals', depositsOnly)).toBe(false);
    expect(canOpenRoute('/users', depositsOnly)).toBe(false);
    expect(canOpenRoute('/businesses', depositsOnly)).toBe(false);
  });

  it('longest prefix wins: /my-withdrawals uses WITHDRAWALS not /', () => {
    expect(permissionForPath('/my-withdrawals')).toBe(PERMISSIONS.WITHDRAWALS);
    expect(permissionForPath('/')).toBeNull();
  });

  it('dashboard / settings / transactions stay open for any sub-admin', () => {
    expect(canOpenRoute('/', depositsOnly)).toBe(true);
    expect(canOpenRoute('/settings', depositsOnly)).toBe(true);
    expect(canOpenRoute('/transactions', depositsOnly)).toBe(true);
  });

  it('admin always allowed regardless of empty permissions array', () => {
    expect(
      canOpenRoute('/wallet', { role: 'admin', permissions: [] }),
    ).toBe(true);
    expect(
      canOpenRoute('/audit', { role: 'admin', permissions: [] }),
    ).toBe(true);
  });

  it('multi-perm sub-admin can open each granted area only', () => {
    const ops = {
      role: 'sub_admin' as const,
      permissions: [PERMISSIONS.WITHDRAWALS, PERMISSIONS.SUPPORT, PERMISSIONS.BUSINESS],
    };
    expect(canOpenRoute('/withdrawals', ops)).toBe(true);
    expect(canOpenRoute('/support', ops)).toBe(true);
    expect(canOpenRoute('/businesses', ops)).toBe(true);
    expect(canOpenRoute('/deposits', ops)).toBe(false);
    expect(canOpenRoute('/wallet', ops)).toBe(false);
  });
});
