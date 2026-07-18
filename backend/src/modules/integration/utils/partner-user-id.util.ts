/**
 * Partner (Bitfarming) user id stored on P2P as externalRef.
 * Canonical form: `bitfarming:{mongoObjectId}` — also accepts raw ObjectId.
 */
export function partnerUserIdFromExternalRef(
  externalRef?: string | null,
): string | undefined {
  const raw = (externalRef || '').trim();
  if (!raw) return undefined;

  const colon = raw.indexOf(':');
  if (colon >= 0) {
    const id = raw.slice(colon + 1).trim();
    return id || undefined;
  }

  return raw;
}

export function bitfarmingExternalRef(bitfarmingUserId: string) {
  return `bitfarming:${bitfarmingUserId.trim()}`;
}
