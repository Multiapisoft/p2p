import type {
  ApiCredentials,
  Deposit,
  IntegrationUser,
  Paginated,
  UserLookupResponse,
  VerifyResponse,
} from './types';

export class P2pApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'P2pApiError';
  }
}

async function request<T>(
  creds: ApiCredentials,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${creds.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': creds.apiKey,
      'X-Api-Secret': creds.apiSecret,
      ...(creds.internalSecret
        ? { 'X-Internal-Secret': creds.internalSecret }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      (json as { message?: string }).message ||
      `Request failed (${res.status})`;
    throw new P2pApiError(msg, res.status, json);
  }

  return ((json as { data?: T }).data ?? json) as T;
}

export const p2pApi = {
  verify: (creds: ApiCredentials) =>
    request<VerifyResponse>(creds, 'GET', '/integration/verify'),

  registerUser: (
    creds: ApiCredentials,
    body: { email: string; password: string; name: string; phone: string; externalRef?: string },
  ) =>
    request<{
      userId: string;
      businessId: string;
      user: IntegrationUser;
    }>(creds, 'POST', '/integration/users', body),

  listUsers: (creds: ApiCredentials, page = 1) =>
    request<Paginated<IntegrationUser>>(creds, 'GET', `/integration/users?page=${page}&limit=20`),

  createDeposit: (
    creds: ApiCredentials,
    body: {
      userId: string;
      amount: number;
      method: 'upi' | 'bank' | 'usdt';
      externalRef?: string;
      upiDetails?: { upiId: string; payerName?: string; utr?: string };
      bankDetails?: {
        accountNumber: string;
        ifscCode: string;
        accountHolderName: string;
        bankName?: string;
      };
      usdtDetails?: { walletAddress: string; network?: string };
    },
  ) => request<Deposit>(creds, 'POST', '/deposits/integration', body),

  getDeposit: (creds: ApiCredentials, referenceId: string) =>
    request<Deposit>(creds, 'GET', `/integration/deposits/${referenceId}`),

  createDepositRedirect: (
    creds: ApiCredentials,
    body: { userId: string; amount: number; returnUrl?: string; externalRef?: string },
  ) =>
    request<{ redirectUrl: string; token: string; amount: number; expiresAt: string }>(
      creds,
      'POST',
      '/integration/redirect/deposit',
      body,
    ),

  createWithdrawalRedirect: (
    creds: ApiCredentials,
    body: { userId: string; amount: number; returnUrl?: string; externalRef?: string },
  ) =>
    request<{ redirectUrl: string; token: string; amount: number; expiresAt: string }>(
      creds,
      'POST',
      '/integration/redirect/withdrawal',
      body,
    ),

  lookupUser: (
    creds: ApiCredentials,
    query: { email?: string; userId?: string; externalRef?: string },
  ) => {
    const params = new URLSearchParams();
    if (query.email) params.set('email', query.email);
    if (query.userId) params.set('userId', query.userId);
    if (query.externalRef) params.set('externalRef', query.externalRef);
    return request<UserLookupResponse>(
      creds,
      'GET',
      `/integration/users/lookup?${params.toString()}`,
    );
  },

  getUserDetails: (creds: ApiCredentials, userId: string) =>
    request<UserLookupResponse>(creds, 'GET', `/integration/users/${userId}`),

  getConfig: (creds: ApiCredentials) =>
    request<{
      endpoints: Record<string, string>;
      partnerSite: Record<string, string | null>;
      userPanelUrl: string;
      flow: string[];
    }>(creds, 'GET', '/integration/config'),

  getUserBalance: async (creds: ApiCredentials, userId: string) => {
    const res = await request<UserLookupResponse>(
      creds,
      'GET',
      `/integration/users/${userId}/balance`,
    );
    const bal = res.balance;
    return {
      userId,
      currency: bal.currency || 'INR',
      balance: bal.balance,
      lockedBalance: bal.lockedBalance,
      availableBalance: bal.availableBalance,
      totalDeposited: res.finguardBalance?.balance ?? 0,
      totalWithdrawn: 0,
      partnerBalance: res.partnerBalance,
      finguardBalance: res.finguardBalance,
    };
  },

  creditUser: (
    creds: ApiCredentials,
    userId: string,
    body: { amount: number; externalRef?: string; reason?: string },
  ) =>
    request<{
      userId: string;
      availableBalance: number;
      balance: number;
    }>(creds, 'POST', `/integration/users/${userId}/credit`, body),

  debitUser: (
    creds: ApiCredentials,
    userId: string,
    body: { amount: number; externalRef?: string; reason?: string },
  ) =>
    request<{
      userId: string;
      availableBalance: number;
      balance: number;
    }>(creds, 'POST', `/integration/users/${userId}/debit`, body),

  cancelDeposit: (creds: ApiCredentials, referenceId: string) =>
    request<Deposit>(creds, 'PATCH', `/integration/deposits/${referenceId}/cancel`),

  cancelWithdrawal: (creds: ApiCredentials, referenceId: string) =>
    request<{ referenceId: string; status: string }>(
      creds,
      'PATCH',
      `/integration/withdrawals/${referenceId}/cancel`,
    ),

  testWebhook: (creds: ApiCredentials) =>
    request<{ success: boolean; message?: string }>(creds, 'POST', '/integration/webhook/test'),
};
