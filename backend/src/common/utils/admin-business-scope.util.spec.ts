import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserRole } from '../enums/role.enum';
import {
  assertActorBusinessAccess,
  assertSubAdminBusinessAccess,
  assignedBusinessOids,
  businessDocumentScopeFilter,
  businessScopeFilter,
  commissionBusinessScopeFilter,
  hasAssignedBusiness,
  referredUserScopeFilter,
  subAdminBusinessIdsOrEmpty,
} from './admin-business-scope.util';

const BIZ_A = new Types.ObjectId().toString();
const BIZ_B = new Types.ObjectId().toString();
const BIZ_C = new Types.ObjectId().toString();

/**
 * Complex product scenarios for sub-admin business assignment:
 * - Admin sees everything (no filter)
 * - Sub-admin with Biz A+B only sees those
 * - Sub-admin with no businesses sees nothing
 * - Mutations blocked for unassigned businesses
 */
describe('admin-business-scope.util — complex scenarios', () => {
  describe('assignedBusinessOids', () => {
    it('keeps only valid ObjectIds and drops garbage', () => {
      const oids = assignedBusinessOids([BIZ_A, 'not-an-id', BIZ_B, '']);
      expect(oids).toHaveLength(2);
      expect(oids[0].toString()).toBe(BIZ_A);
      expect(oids[1].toString()).toBe(BIZ_B);
    });
  });

  describe('businessScopeFilter (deposits / withdrawals / payments / support)', () => {
    it('admin and business roles get unrestricted (null filter)', () => {
      expect(businessScopeFilter(UserRole.ADMIN, [BIZ_A])).toBeNull();
      expect(businessScopeFilter(UserRole.BUSINESS, [BIZ_A])).toBeNull();
      expect(businessScopeFilter(UserRole.USER, [BIZ_A])).toBeNull();
    });

    it('sub-admin with no assignments matches nothing (empty $in)', () => {
      const filter = businessScopeFilter(UserRole.SUB_ADMIN, []);
      expect(filter).toEqual({ businessId: { $in: [] } });
      expect(businessScopeFilter(UserRole.SUB_ADMIN, undefined)).toEqual({
        businessId: { $in: [] },
      });
    });

    it('sub-admin assigned A+B can query both ObjectId and string forms', () => {
      const filter = businessScopeFilter(UserRole.SUB_ADMIN, [BIZ_A, BIZ_B]) as {
        $or: Array<{ businessId: { $in: unknown[] } }>;
      };
      expect(filter.$or).toHaveLength(2);
      const oidList = filter.$or[0].businessId.$in as Types.ObjectId[];
      expect(oidList.map(String).sort()).toEqual([BIZ_A, BIZ_B].sort());
      expect(filter.$or[1].businessId.$in).toEqual([BIZ_A, BIZ_B]);
    });

    it('simulates list leak prevention: Biz C deposit not in assigned set', () => {
      const filter = businessScopeFilter(UserRole.SUB_ADMIN, [BIZ_A, BIZ_B])!;
      const assigned = new Set([BIZ_A, BIZ_B]);
      // Mirror how Mongo $in would behave for a Biz C row
      expect(assigned.has(BIZ_C)).toBe(false);
      expect(JSON.stringify(filter)).toContain(BIZ_A);
      expect(JSON.stringify(filter)).not.toContain(BIZ_C);
    });
  });

  describe('businessDocumentScopeFilter (businesses list)', () => {
    it('sub-admin with A+C only lists those business documents', () => {
      const filter = businessDocumentScopeFilter(UserRole.SUB_ADMIN, [BIZ_A, BIZ_C]) as {
        _id: { $in: Types.ObjectId[] };
      };
      expect(filter._id.$in.map(String).sort()).toEqual([BIZ_A, BIZ_C].sort());
    });

    it('empty assignment → empty business list', () => {
      expect(businessDocumentScopeFilter(UserRole.SUB_ADMIN, [])).toEqual({
        _id: { $in: [] },
      });
    });
  });

  describe('referredUserScopeFilter (users list)', () => {
    it('scopes users by referredByBusiness to assigned businesses', () => {
      const filter = referredUserScopeFilter(UserRole.SUB_ADMIN, [BIZ_A]) as {
        $or: Array<{ referredByBusiness: { $in: unknown[] } }>;
      };
      expect(filter.$or[0].referredByBusiness.$in).toHaveLength(1);
      expect(String((filter.$or[0].referredByBusiness.$in as Types.ObjectId[])[0])).toBe(
        BIZ_A,
      );
    });
  });

  describe('commissionBusinessScopeFilter', () => {
    it('only returns BUSINESS target configs for assigned ids', () => {
      const filter = commissionBusinessScopeFilter(UserRole.SUB_ADMIN, [BIZ_B]) as {
        $or: Array<{ targetType: string; targetId: { $in: unknown[] } }>;
      };
      expect(filter.$or[0]).toMatchObject({
        targetType: 'business',
        targetId: { $in: [BIZ_B] },
      });
    });

    it('empty assignment → no commission business rows', () => {
      expect(commissionBusinessScopeFilter(UserRole.SUB_ADMIN, [])).toEqual({
        targetType: 'business',
        targetId: { $in: [] },
      });
    });
  });

  describe('assertSubAdminBusinessAccess / assertActorBusinessAccess', () => {
    it('admin may act on any business without assignment', () => {
      expect(() =>
        assertSubAdminBusinessAccess(UserRole.ADMIN, [], BIZ_C),
      ).not.toThrow();
      expect(() =>
        assertActorBusinessAccess(
          { role: UserRole.ADMIN, assignedBusinessIds: [] },
          BIZ_C,
        ),
      ).not.toThrow();
    });

    it('sub-admin may approve deposit for assigned Biz A', () => {
      expect(() =>
        assertActorBusinessAccess(
          { role: UserRole.SUB_ADMIN, assignedBusinessIds: [BIZ_A, BIZ_B] },
          BIZ_A,
        ),
      ).not.toThrow();
    });

    it('sub-admin blocked from approving Biz C when only A+B assigned (mutation hole closed)', () => {
      expect(() =>
        assertActorBusinessAccess(
          { role: UserRole.SUB_ADMIN, assignedBusinessIds: [BIZ_A, BIZ_B] },
          BIZ_C,
        ),
      ).toThrow(ForbiddenException);
    });

    it('sub-admin blocked when resource has no businessId', () => {
      expect(() =>
        assertSubAdminBusinessAccess(UserRole.SUB_ADMIN, [BIZ_A], null),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertSubAdminBusinessAccess(UserRole.SUB_ADMIN, [BIZ_A], undefined),
      ).toThrow(ForbiddenException);
    });

    it('sub-admin with empty assignment cannot mutate anything', () => {
      expect(() =>
        assertActorBusinessAccess(
          { role: UserRole.SUB_ADMIN, assignedBusinessIds: [] },
          BIZ_A,
        ),
      ).toThrow(ForbiddenException);
    });

    it('null actor is a no-op (optional caller)', () => {
      expect(() => assertActorBusinessAccess(null, BIZ_A)).not.toThrow();
      expect(() => assertActorBusinessAccess(undefined, BIZ_A)).not.toThrow();
    });
  });

  describe('hasAssignedBusiness + subAdminBusinessIdsOrEmpty', () => {
    it('hasAssignedBusiness membership checks', () => {
      expect(hasAssignedBusiness([BIZ_A, BIZ_B], BIZ_A)).toBe(true);
      expect(hasAssignedBusiness([BIZ_A], BIZ_C)).toBe(false);
      expect(hasAssignedBusiness([], BIZ_A)).toBe(false);
      expect(hasAssignedBusiness([BIZ_A], null)).toBe(false);
    });

    it('subAdminBusinessIdsOrEmpty always returns array for sub-admin (incl. empty)', () => {
      expect(
        subAdminBusinessIdsOrEmpty({
          role: UserRole.SUB_ADMIN,
          assignedBusinessIds: [BIZ_A],
        }),
      ).toEqual([BIZ_A]);
      expect(
        subAdminBusinessIdsOrEmpty({
          role: UserRole.SUB_ADMIN,
          assignedBusinessIds: undefined,
        }),
      ).toEqual([]);
      expect(
        subAdminBusinessIdsOrEmpty({
          role: UserRole.ADMIN,
          assignedBusinessIds: [BIZ_A],
        }),
      ).toBeUndefined();
    });
  });

  describe('end-to-end scenario: multi-tenant isolation', () => {
    /**
     * Sub-admin "Ops" assigned to BizA only.
     * Resources: depositA (BizA), depositB (BizB), wdA, wdB.
     * Expect: can list/mutate A; blocked on B.
     */
    it('Ops can only touch BizA resources', () => {
      const ops = {
        role: UserRole.SUB_ADMIN,
        assignedBusinessIds: [BIZ_A],
      };
      const listFilter = businessScopeFilter(ops.role, ops.assignedBusinessIds)!;

      const deposits = [
        { id: 'dA', businessId: BIZ_A },
        { id: 'dB', businessId: BIZ_B },
      ];
      const visible = deposits.filter((d) =>
        hasAssignedBusiness(ops.assignedBusinessIds, d.businessId),
      );
      expect(visible.map((d) => d.id)).toEqual(['dA']);

      expect(() => assertActorBusinessAccess(ops, BIZ_A)).not.toThrow();
      expect(() => assertActorBusinessAccess(ops, BIZ_B)).toThrow(ForbiddenException);

      // List filter must not accidentally include BizB
      expect(JSON.stringify(listFilter)).toContain(BIZ_A);
      expect(JSON.stringify(listFilter)).not.toContain(BIZ_B);
    });
  });
});
