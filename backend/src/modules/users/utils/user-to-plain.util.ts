/**
 * Normalize mongoose document or Redis-cached plain user into a mutable plain object.
 * Cached users from Redis are plain JSON — they have no `.toObject()`.
 */
export function userToPlainRecord(
  user: { toObject?: (opts?: object) => Record<string, unknown> } | Record<string, unknown>,
): Record<string, unknown> {
  if (user && typeof (user as { toObject?: unknown }).toObject === 'function') {
    return (user as { toObject: () => Record<string, unknown> }).toObject();
  }
  return { ...(user as Record<string, unknown>) };
}
