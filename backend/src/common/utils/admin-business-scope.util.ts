import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserRole } from '../enums/role.enum';
import type { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

/** ObjectIds for assigned businesses; empty array means match-nothing for sub-admins. */
export function assignedBusinessOids(
  assignedBusinessIds?: string[] | null,
): Types.ObjectId[] {
  return (assignedBusinessIds || [])
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
}

/**
 * Mongo filter fragment for resources with `businessId`.
 * - ADMIN / non-sub-admin → null (no extra filter)
 * - SUB_ADMIN with no assignments → match nothing
 * - SUB_ADMIN with assignments → businessId ∈ assigned
 */
export function businessScopeFilter(
  role: UserRole | string | undefined,
  assignedBusinessIds?: string[] | null,
): Record<string, unknown> | null {
  if (role !== UserRole.SUB_ADMIN) return null;
  const oids = assignedBusinessOids(assignedBusinessIds);
  const raw = (assignedBusinessIds || []).filter(Boolean);
  if (!oids.length) {
    return { businessId: { $in: [] } };
  }
  return {
    $or: [{ businessId: { $in: oids } }, { businessId: { $in: raw } }],
  };
}

/** Filter businesses collection by `_id` for sub-admins. */
export function businessDocumentScopeFilter(
  role: UserRole | string | undefined,
  assignedBusinessIds?: string[] | null,
): Record<string, unknown> | null {
  if (role !== UserRole.SUB_ADMIN) return null;
  const oids = assignedBusinessOids(assignedBusinessIds);
  if (!oids.length) return { _id: { $in: [] } };
  return { _id: { $in: oids } };
}

/** Users referred by assigned businesses. */
export function referredUserScopeFilter(
  role: UserRole | string | undefined,
  assignedBusinessIds?: string[] | null,
): Record<string, unknown> | null {
  if (role !== UserRole.SUB_ADMIN) return null;
  const oids = assignedBusinessOids(assignedBusinessIds);
  const raw = (assignedBusinessIds || []).filter(Boolean);
  if (!oids.length) {
    return { referredByBusiness: { $in: [] } };
  }
  return {
    $or: [
      { referredByBusiness: { $in: oids } },
      { referredByBusiness: { $in: raw } },
    ],
  };
}

/** Commission configs scoped to assigned businesses (BUSINESS target). */
export function commissionBusinessScopeFilter(
  role: UserRole | string | undefined,
  assignedBusinessIds?: string[] | null,
): Record<string, unknown> | null {
  if (role !== UserRole.SUB_ADMIN) return null;
  const raw = (assignedBusinessIds || []).filter(Boolean);
  if (!raw.length) {
    return { targetType: 'business', targetId: { $in: [] } };
  }
  return {
    $or: [
      { targetType: 'business', targetId: { $in: raw } },
      { targetType: 'business', targetId: { $in: assignedBusinessOids(assignedBusinessIds) } },
    ],
  };
}

export function assertSubAdminBusinessAccess(
  role: UserRole | string | undefined,
  assignedBusinessIds: string[] | undefined | null,
  resourceBusinessId: string | undefined | null,
  message = 'You are not assigned to this business',
) {
  if (role !== UserRole.SUB_ADMIN) return;
  const allowed = new Set((assignedBusinessIds || []).map(String));
  if (!resourceBusinessId || !allowed.has(String(resourceBusinessId))) {
    throw new ForbiddenException(message);
  }
}

/** Convenience: assert from AuthenticatedUser. */
export function assertActorBusinessAccess(
  actor: Pick<AuthenticatedUser, 'role' | 'assignedBusinessIds'> | undefined | null,
  resourceBusinessId: string | undefined | null,
  message?: string,
) {
  if (!actor) return;
  assertSubAdminBusinessAccess(
    actor.role,
    actor.assignedBusinessIds,
    resourceBusinessId,
    message,
  );
}

export function hasAssignedBusiness(
  assignedBusinessIds: string[] | undefined | null,
  businessId: string | undefined | null,
): boolean {
  if (!businessId) return false;
  return (assignedBusinessIds || []).map(String).includes(String(businessId));
}

/** Sub-admin assignments for list filters (always defined array for sub-admin). */
export function subAdminBusinessIdsOrEmpty(
  actor: Pick<AuthenticatedUser, 'role' | 'assignedBusinessIds'> | undefined | null,
): string[] | undefined {
  if (!actor || actor.role !== UserRole.SUB_ADMIN) return undefined;
  return actor.assignedBusinessIds || [];
}
