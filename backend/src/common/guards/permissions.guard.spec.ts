import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { Permission } from '../enums/permission.enum';
import { UserRole } from '../enums/role.enum';
import type { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

function mockContext(user: AuthenticatedUser, type: 'http' | 'ws' = 'http') {
  return {
    getType: () => type,
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as never;
}

describe('PermissionsGuard — complex rights scenarios', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let usersRepo: { findById: jest.Mock };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    usersRepo = { findById: jest.fn() };
    guard = new PermissionsGuard(reflector as unknown as Reflector, usersRepo as never);
  });

  it('allows websocket without checking perms', async () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.DEPOSITS_MANAGE]);
    await expect(
      guard.canActivate(
        mockContext({ userId: '1', email: 'a@x.com', role: UserRole.USER }, 'ws'),
      ),
    ).resolves.toBe(true);
  });

  it('passes when no @Permissions metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(
      guard.canActivate(
        mockContext({ userId: '1', email: 'a@x.com', role: UserRole.SUB_ADMIN }),
      ),
    ).resolves.toBe(true);
  });

  it('ADMIN bypasses every permission requirement', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      Permission.DEPOSITS_MANAGE,
      Permission.WITHDRAWALS_MANAGE,
      Permission.WALLET_ADJUST,
    ]);
    await expect(
      guard.canActivate(
        mockContext({ userId: 'admin', email: 'admin@x.com', role: UserRole.ADMIN }),
      ),
    ).resolves.toBe(true);
    expect(usersRepo.findById).not.toHaveBeenCalled();
  });

  describe('SUB_ADMIN rights must actually match chips', () => {
    it('allows deposits.manage when granted', async () => {
      reflector.getAllAndOverride.mockReturnValue([Permission.DEPOSITS_MANAGE]);
      usersRepo.findById.mockResolvedValue({
        permissions: [Permission.DEPOSITS_MANAGE, Permission.USERS_MANAGE],
      });
      await expect(
        guard.canActivate(
          mockContext({
            userId: 'sub1',
            email: 'ops@x.com',
            role: UserRole.SUB_ADMIN,
            permissions: [Permission.DEPOSITS_MANAGE],
          }),
        ),
      ).resolves.toBe(true);
    });

    it('blocks withdrawals.manage when only deposits.manage granted', async () => {
      reflector.getAllAndOverride.mockReturnValue([Permission.WITHDRAWALS_MANAGE]);
      usersRepo.findById.mockResolvedValue({
        permissions: [Permission.DEPOSITS_MANAGE],
      });
      await expect(
        guard.canActivate(
          mockContext({
            userId: 'sub1',
            email: 'ops@x.com',
            role: UserRole.SUB_ADMIN,
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires ALL listed permissions (AND semantics)', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        Permission.DEPOSITS_MANAGE,
        Permission.WITHDRAWALS_MANAGE,
      ]);
      usersRepo.findById.mockResolvedValue({
        permissions: [Permission.DEPOSITS_MANAGE],
      });
      await expect(
        guard.canActivate(
          mockContext({
            userId: 'sub1',
            email: 'ops@x.com',
            role: UserRole.SUB_ADMIN,
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks user/investor roles from admin permission routes', async () => {
      reflector.getAllAndOverride.mockReturnValue([Permission.DEPOSITS_MANAGE]);
      await expect(
        guard.canActivate(
          mockContext({ userId: 'u1', email: 'u@x.com', role: UserRole.USER }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('BUSINESS on shared admin routes (list-for-p2p etc.)', () => {
    it('allows business owner when only admin-panel perms are required', async () => {
      // Shared route: @Permissions(WITHDRAWALS_MANAGE) — business staff perms empty after filter
      reflector.getAllAndOverride.mockReturnValue([Permission.WITHDRAWALS_MANAGE]);
      await expect(
        guard.canActivate(
          mockContext({
            userId: 'owner',
            email: 'biz@x.com',
            role: UserRole.BUSINESS,
          }),
        ),
      ).resolves.toBe(true);
      expect(usersRepo.findById).not.toHaveBeenCalled();
    });

    it('business owner (no staffBusinessId) allowed for business staff perms', async () => {
      reflector.getAllAndOverride.mockReturnValue([Permission.BUSINESS_WITHDRAWALS]);
      usersRepo.findById.mockResolvedValue({
        staffBusinessId: null,
        permissions: [],
      });
      await expect(
        guard.canActivate(
          mockContext({
            userId: 'owner',
            email: 'biz@x.com',
            role: UserRole.BUSINESS,
          }),
        ),
      ).resolves.toBe(true);
    });

    it('business staff needs matching staff permission', async () => {
      reflector.getAllAndOverride.mockReturnValue([Permission.BUSINESS_WITHDRAWALS]);
      usersRepo.findById.mockResolvedValue({
        staffBusinessId: 'biz1',
        permissions: [Permission.BUSINESS_DEPOSIT_VERIFY],
      });
      await expect(
        guard.canActivate(
          mockContext({
            userId: 'staff',
            email: 'staff@x.com',
            role: UserRole.BUSINESS,
            staffBusinessId: 'biz1',
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      usersRepo.findById.mockResolvedValue({
        staffBusinessId: 'biz1',
        permissions: [Permission.BUSINESS_WITHDRAWALS],
      });
      await expect(
        guard.canActivate(
          mockContext({
            userId: 'staff',
            email: 'staff@x.com',
            role: UserRole.BUSINESS,
            staffBusinessId: 'biz1',
          }),
        ),
      ).resolves.toBe(true);
    });
  });
});
