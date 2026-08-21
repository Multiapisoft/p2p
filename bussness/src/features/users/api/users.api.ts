import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Paginated, PaymentMethod, SavedWithdrawalMethod, User } from '@/shared/types/api.types';

export type UpsertSavedWithdrawalMethodPayload = {
  label?: string;
  method: PaymentMethod;
  isDefault?: boolean;
  upiDetails?: { upiId: string; payerName: string };
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName: string;
  };
  usdtDetails?: { walletAddress: string; network?: string };
};

export type UsersListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
  role?: string;
};

function cleanQuery(query: UsersListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    role: query.role && query.role !== 'all' ? query.role : undefined,
  };
}

export const usersApi = {
  getMe: () => apiGet<User>('/users/me'),
  updateMe: (body: { name?: string; phone?: string }) => apiPatch<User>('/users/me', body),
  getWithdrawalMethods: () =>
    apiGet<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods'),
  saveWithdrawalMethod: (payload: UpsertSavedWithdrawalMethodPayload) =>
    apiPost<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods', payload),
  setDefaultWithdrawalMethod: (methodId: string) =>
    apiPatch<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/default`),
  deleteWithdrawalMethod: (methodId: string) =>
    apiPost<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/delete`),
  getBusinessUsers: (query: UsersListQuery = {}) =>
    apiGet<Paginated<User>>('/business/me/users', cleanQuery(query)),
  /** Reset a linked end-user's password (business panel). */
  setUserPassword: (userId: string, newPassword: string) =>
    apiPatch<User>(`/business/me/users/${userId}/password`, { newPassword }),
  /** Set / update identification code for a linked user. */
  setUserCode: (userId: string, code: string) =>
    apiPatch<User>(`/business/me/users/${userId}/code`, { code }),
  /** Change the logged-in business owner's own password. */
  setOwnPassword: (newPassword: string, currentPassword: string) =>
    apiPost('/auth/set-password', { newPassword, currentPassword }),
};
