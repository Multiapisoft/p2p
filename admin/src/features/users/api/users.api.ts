import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { PaymentMethod, SavedWithdrawalMethod, User, Paginated } from '@/shared/types/api.types';

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

export type UserListQuery = {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  sort?: string;
  status?: string;
};

function cleanQuery(query: UserListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    role: query.role && query.role !== 'all' ? query.role : undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
  };
}

export const usersApi = {
  list: (query: UserListQuery = {}) =>
    apiGet<Paginated<User>>('/users', cleanQuery(query)),
  getById: (id: string) => apiGet<User>(`/users/${id}`),
  updateStatus: (id: string, status: string) =>
    apiPatch<User>(`/admin/users/${id}/status`, { status }),
  getWithdrawalMethods: () =>
    apiGet<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods'),
  saveWithdrawalMethod: (payload: UpsertSavedWithdrawalMethodPayload) =>
    apiPost<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods', payload),
  setDefaultWithdrawalMethod: (methodId: string) =>
    apiPatch<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/default`),
  deleteWithdrawalMethod: (methodId: string) =>
    apiPost<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/delete`),
};
