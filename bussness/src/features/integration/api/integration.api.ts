import { apiGet, apiPost, apiPatch } from '@/shared/api/client';

export interface PartnerBalance {
  source: 'partner';
  email: string;
  currency: string;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
}

export interface UserWalletBalance {
  userId: string;
  currency: string;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  partnerBalance?: PartnerBalance | null;
  finguardBalance?: UserWalletBalance;
}

export interface RedirectResponse {
  redirectUrl: string;
  token: string;
  amount: number;
  expiresAt: string;
}

export interface UserLookupResult {
  user: {
    _id: string;
    userId: string;
    businessId: string;
    name: string;
    email: string;
    phone?: string;
    externalRef?: string;
    businessUserCode?: string;
  };
  partnerBalance: PartnerBalance | null;
  balance: {
    availableBalance: number;
    balance: number;
    lockedBalance: number;
    currency?: string;
  };
  finguardBalance?: UserWalletBalance;
}

export const integrationApi = {
  lookupUser: (query: { email?: string; userId?: string; externalRef?: string }) =>
    apiGet<UserLookupResult>(`/business/me/integration/users/lookup`, query),

  getUserDetails: (userId: string) =>
    apiGet<UserLookupResult>(`/business/me/integration/users/${userId}`),

  getPartnerBalance: (email: string) =>
    apiGet<PartnerBalance>(`/business/me/integration/partner-balance`, { email }),

  getUserBalance: async (userId: string) => {
    const res = await apiGet<UserLookupResult>(
      `/business/me/integration/users/${userId}/balance`,
    );
    const bal = res.balance;
    return {
      userId,
      currency: bal.currency || 'INR',
      balance: bal.balance,
      lockedBalance: bal.lockedBalance,
      availableBalance: bal.availableBalance,
      totalDeposited: res.finguardBalance?.totalDeposited ?? 0,
      totalWithdrawn: res.finguardBalance?.totalWithdrawn ?? 0,
      partnerBalance: res.partnerBalance,
      finguardBalance: res.finguardBalance,
    } satisfies UserWalletBalance;
  },

  creditUser: (userId: string, body: { amount: number; externalRef?: string; reason?: string }) =>
    apiPost<UserWalletBalance>(`/business/me/integration/users/${userId}/credit`, body),

  debitUser: (userId: string, body: { amount: number; externalRef?: string; reason?: string }) =>
    apiPost<UserWalletBalance>(`/business/me/integration/users/${userId}/debit`, body),

  redirectDeposit: (body: { userId: string; amount: number; returnUrl?: string; externalRef?: string }) =>
    apiPost<RedirectResponse>('/business/me/integration/redirect/deposit', body),

  redirectWithdrawal: (body: { userId: string; amount: number; returnUrl?: string; externalRef?: string }) =>
    apiPost<RedirectResponse>('/business/me/integration/redirect/withdrawal', body),

  cancelDeposit: (referenceId: string) =>
    apiPatch<{ referenceId: string; status: string }>(
      `/business/me/integration/deposits/${referenceId}/cancel`,
    ),

  cancelWithdrawal: (referenceId: string) =>
    apiPatch<{ referenceId: string; status: string }>(
      `/business/me/integration/withdrawals/${referenceId}/cancel`,
    ),
};
