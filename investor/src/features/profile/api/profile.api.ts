import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { SavedWithdrawalMethod } from '@/shared/types/api.types';

export const profileApi = {
  getMe: () => apiGet<import('@/shared/types/api.types').User>('/users/me'),
  updateMe: (data: { name?: string; phone?: string }) => apiPatch('/users/me', data),
  getWithdrawalMethods: () =>
    apiGet<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods'),
  saveWithdrawalMethod: (payload: {
    label?: string;
    method: 'upi' | 'bank' | 'usdt';
    isDefault?: boolean;
    upiDetails?: { upiId: string; payerName: string };
    bankDetails?: { accountNumber: string; ifscCode: string; accountHolderName: string; bankName: string };
    usdtDetails?: { walletAddress: string; network?: string };
  }) => apiPost<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods', payload),
  updateWithdrawalMethod: (
    methodId: string,
    payload: {
      label?: string;
      method: 'upi' | 'bank' | 'usdt';
      isDefault?: boolean;
      upiDetails?: { upiId: string; payerName: string };
      bankDetails?: { accountNumber: string; ifscCode: string; accountHolderName: string; bankName: string };
      usdtDetails?: { walletAddress: string; network?: string };
    },
  ) => apiPatch<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}`, payload),
  setDefaultWithdrawalMethod: (methodId: string) =>
    apiPatch<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/default`),
  deleteWithdrawalMethod: (methodId: string) =>
    apiPost<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/delete`),
  setInvestorPlan: (planAmount: number) =>
    apiPatch<import('@/features/fulfill/api/fulfill.api').InvestorLimitSnapshot>(
      '/users/me/investor-plan',
      { planAmount },
    ),
  addInvestorLimit: (amount: number) =>
    apiPost<import('@/features/fulfill/api/fulfill.api').InvestorLimitSnapshot>(
      '/users/me/investor-limit',
      { amount },
    ),
};
