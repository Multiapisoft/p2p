/**
 * Standard partner wallet API paths (Bitfarming & other partners).
 * Partner only hosts these fixed routes — FinGuard stores the expanded URLs.
 */
export const PARTNER_API_PATHS = {
  balance: '/api/p2p/partner/balance',
  credit: '/api/p2p/partner/credit',
  debit: '/api/p2p/partner/debit',
} as const;

export function normalizePartnerBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '');
}

/** Expand one partner origin into balance / credit / debit URLs. */
export function expandPartnerApiFromBase(baseUrl: string): {
  baseUrl: string;
  balanceUrl: string;
  creditUrl: string;
  debitUrl: string;
} {
  const base = normalizePartnerBaseUrl(baseUrl);
  if (!base) {
    throw new Error('Partner base URL is required');
  }

  let prefix = base;
  if (base.endsWith('/api/p2p/partner')) {
    prefix = base;
  } else if (base.endsWith('/api')) {
    prefix = `${base}/p2p/partner`;
  } else {
    prefix = `${base}/api/p2p/partner`;
  }

  return {
    baseUrl: base,
    balanceUrl: `${prefix}/balance`,
    creditUrl: `${prefix}/credit`,
    debitUrl: `${prefix}/debit`,
  };
}

export function resolvePartnerApiUrls(input?: {
  baseUrl?: string;
  balanceUrl?: string;
  creditUrl?: string;
  debitUrl?: string;
} | null): {
  baseUrl?: string;
  balanceUrl?: string;
  creditUrl?: string;
  debitUrl?: string;
} | null {
  if (!input) return null;

  const base = input.baseUrl?.trim();
  if (base) {
    return expandPartnerApiFromBase(base);
  }

  const balanceUrl = input.balanceUrl?.trim();
  const creditUrl = input.creditUrl?.trim();
  const debitUrl = input.debitUrl?.trim();

  // No partner URLs yet — business can configure later (referral-only signup)
  if (!balanceUrl && !creditUrl && !debitUrl) {
    return null;
  }

  if (!balanceUrl || !creditUrl || !debitUrl) {
    throw new Error('Provide partner baseUrl, or all three balance/credit/debit URLs');
  }

  return { balanceUrl, creditUrl, debitUrl };
}
