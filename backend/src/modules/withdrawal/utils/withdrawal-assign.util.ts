import { Types } from 'mongoose';

type IdLike =
  | string
  | Types.ObjectId
  | { _id?: string | Types.ObjectId }
  | null
  | undefined;

export function assigneeUserId(assignedTo: IdLike): string | null {
  if (!assignedTo) return null;
  if (typeof assignedTo === 'string') {
    return assignedTo.trim() || null;
  }
  if (assignedTo instanceof Types.ObjectId) {
    return assignedTo.toString();
  }
  if (typeof assignedTo === 'object' && assignedTo._id) {
    return String(assignedTo._id);
  }
  return String(assignedTo);
}

export function isAssignedToPayer(assignedTo: IdLike, payerUserId: string): boolean {
  const id = assigneeUserId(assignedTo);
  return !!id && id === payerUserId;
}

export function isAssignedToOther(assignedTo: IdLike, payerUserId: string): boolean {
  const id = assigneeUserId(assignedTo);
  return !!id && id !== payerUserId;
}

/** Public pay list: unassigned, or assigned to this viewer. */
export function assignedToViewerFilter(userId: string) {
  const userOid = new Types.ObjectId(userId);
  return {
    $or: [
      { assignedTo: { $exists: false } },
      { assignedTo: null },
      { assignedTo: userOid },
      { assignedTo: userId },
    ],
  };
}

export function assignedToMeFilter(userId: string) {
  const userOid = new Types.ObjectId(userId);
  return {
    $or: [{ assignedTo: userOid }, { assignedTo: userId }],
  };
}

export function remainingOpenExpr() {
  return {
    $lt: [
      {
        $add: [{ $ifNull: ['$paidAmount', 0] }, { $ifNull: ['$reservedAmount', 0] }],
      },
      '$amount',
    ],
  };
}
