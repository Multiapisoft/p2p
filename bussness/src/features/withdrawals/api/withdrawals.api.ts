import { apiGet } from '@/shared/api/client';
import type { Paginated, Withdrawal } from '@/shared/types/api.types';

export type WithdrawalsListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
  method?: string;
};

function cleanQuery(query: WithdrawalsListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const withdrawalsApi = {
  getBusinessWithdrawals: (query: WithdrawalsListQuery = {}) =>
    apiGet<Paginated<Withdrawal>>('/withdrawals/business', cleanQuery(query)),
  getById: (id: string) => apiGet<Withdrawal>(`/withdrawals/business/${id}`),
};
