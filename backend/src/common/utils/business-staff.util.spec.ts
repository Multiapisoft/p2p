import { Permission } from '../enums/permission.enum';
import {
  isBusinessOwner,
  isBusinessStaffPermission,
  sanitizeBusinessStaffPermissions,
  staffHasPermission,
} from './business-staff.util';

describe('business-staff.util', () => {
  it('owner can do every staff action', () => {
    expect(
      staffHasPermission({
        isOwner: true,
        permissions: [],
        need: Permission.BUSINESS_MANUAL_WITHDRAWAL,
      }),
    ).toBe(true);
  });

  it('staff needs the matching permission', () => {
    expect(
      staffHasPermission({
        isOwner: false,
        permissions: [Permission.BUSINESS_WITHDRAWALS],
        need: Permission.BUSINESS_WITHDRAWALS,
      }),
    ).toBe(true);
    expect(
      staffHasPermission({
        isOwner: false,
        permissions: [Permission.BUSINESS_WITHDRAWALS],
        need: Permission.BUSINESS_DEPOSIT_VERIFY,
      }),
    ).toBe(false);
    expect(
      staffHasPermission({
        isOwner: false,
        permissions: [],
        need: Permission.BUSINESS_MANUAL_WITHDRAWAL,
      }),
    ).toBe(false);
  });

  it('drops unknown permission strings', () => {
    expect(
      sanitizeBusinessStaffPermissions([
        Permission.BUSINESS_DEPOSIT_VERIFY,
        'deposits.manage',
        'not-a-perm',
      ]),
    ).toEqual([Permission.BUSINESS_DEPOSIT_VERIFY]);
    expect(isBusinessStaffPermission('deposits.manage')).toBe(false);
  });

  it('owner is business without staffBusinessId', () => {
    expect(isBusinessOwner({ role: 'business' })).toBe(true);
    expect(isBusinessOwner({ role: 'business', staffBusinessId: 'biz-1' })).toBe(false);
    expect(isBusinessOwner({ role: 'user' })).toBe(false);
  });
});
