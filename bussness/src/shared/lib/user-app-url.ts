/** User panel base URL for invite / SSO links (never the business panel). */
const LOCAL_USER_APP = 'http://localhost:4761';
/**
 * Live user panel. Prefer NEXT_PUBLIC_USER_APP_URL /
 * backend USER_APP_URL = https://dev.app.paysecure247.com once DNS points to VPS (Noida #1).
 */
const PROD_USER_APP = 'https://dev.app.fairplayoffical.com';

function looksLikeLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Resolve the public user-app origin for business invite links.
 * Prefer backend `userPanelUrl`; never fall back to the business panel origin.
 */
export function resolveUserAppUrl(fromApi?: string | null): string {
  const candidates = [fromApi, process.env.NEXT_PUBLIC_USER_APP_URL];
  for (const raw of candidates) {
    const trimmed = (raw || '').trim().replace(/\/$/, '');
    if (!trimmed) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }

  if (typeof window !== 'undefined' && looksLikeLocalHost(window.location.hostname)) {
    return LOCAL_USER_APP;
  }
  if (process.env.NODE_ENV === 'development') {
    return LOCAL_USER_APP;
  }
  return PROD_USER_APP;
}

/** User register URL with business referral / invite code. */
export function userInviteRegisterUrl(
  referralCode: string,
  userPanelUrl?: string | null,
): string {
  const base = resolveUserAppUrl(userPanelUrl);
  return `${base}/register?code=${encodeURIComponent(referralCode)}`;
}
