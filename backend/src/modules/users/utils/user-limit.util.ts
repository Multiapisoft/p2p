/** Effective user cap: business override wins; 0 on both = unlimited. */
export function resolveMaxUsers(
  businessMaxUsers: number | undefined | null,
  platformMaxUsers: number | undefined | null,
): number {
  const biz = Number(businessMaxUsers) || 0;
  if (biz > 0) return biz;
  return Number(platformMaxUsers) || 0;
}
