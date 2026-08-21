import { Types } from 'mongoose';
import {
  assignedToMeFilter,
  assignedToViewerFilter,
  assigneeUserId,
  isAssignedToOther,
  isAssignedToPayer,
} from './withdrawal-assign.util';

describe('withdrawal-assign.util', () => {
  const userId = '64b0a1c2d3e4f5060708090a';
  const otherId = '64b0a1c2d3e4f5060708090b';

  it('reads assignee from string, ObjectId, or populated doc', () => {
    expect(assigneeUserId(userId)).toBe(userId);
    expect(assigneeUserId(new Types.ObjectId(userId))).toBe(userId);
    expect(assigneeUserId({ _id: userId })).toBe(userId);
    expect(assigneeUserId(null)).toBeNull();
  });

  it('detects assigned payer vs others', () => {
    expect(isAssignedToPayer(userId, userId)).toBe(true);
    expect(isAssignedToPayer(null, userId)).toBe(false);
    expect(isAssignedToOther(otherId, userId)).toBe(true);
    expect(isAssignedToOther(userId, userId)).toBe(false);
    expect(isAssignedToOther(null, userId)).toBe(false);
  });

  it('viewer filter includes unassigned and self', () => {
    const f = assignedToViewerFilter(userId);
    expect(f.$or).toEqual(
      expect.arrayContaining([
        { assignedTo: null },
        { assignedTo: userId },
      ]),
    );
  });

  it('assigned-to-me filter matches ObjectId and string', () => {
    const f = assignedToMeFilter(userId);
    expect(f.$or).toHaveLength(2);
    expect(f.$or[1]).toEqual({ assignedTo: userId });
  });
});
