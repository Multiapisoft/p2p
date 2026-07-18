import { apiGet, apiPost } from '@/shared/api/client';

export interface IntegrationSession {
  token: string;
  type: 'deposit' | 'withdrawal' | 'portal';
  amount: number;
  currency: string;
  returnUrl: string;
  externalRef?: string;
  isNewUser?: boolean;
  initialPassword?: string;
  user: { id: string; email: string; name: string } | null;
}

export interface ClaimResponse {
  accessToken: string;
  user: { id: string; email: string; role: string; mustSetPassword?: boolean };
  session: {
    token: string;
    type: 'deposit' | 'withdrawal' | 'portal';
    amount: number;
    returnUrl: string;
    externalRef?: string;
    isNewUser?: boolean;
  };
}

export const integrationApi = {
  getSession: (token: string) => apiGet<IntegrationSession>(`/integration/redirect/${token}`),
  claim: (token: string) => apiPost<ClaimResponse>('/integration/redirect/claim', { token }),
};
