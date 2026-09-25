import { apiPost } from '@/shared/api/client';

export type ImpersonateResult = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  panelUrl: string;
  loginUrl: string;
};

export const authImpersonateApi = {
  asUser: (userId: string) => apiPost<ImpersonateResult>(`/auth/impersonate/${userId}`),
};

export function openImpersonateSession(result: ImpersonateResult) {
  if (!result.loginUrl) throw new Error('Missing login URL');
  window.open(result.loginUrl, '_blank', 'noopener,noreferrer');
}
