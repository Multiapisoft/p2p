import { apiGet, apiPatch } from '@/shared/api/client';
import type { Withdrawal, Paginated } from '@/shared/types/api.types';

export type WithdrawalListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  method?: string;
};

function cleanQuery(query: WithdrawalListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const withdrawalsApi = {
  getPending: (query: WithdrawalListQuery = {}) =>
    apiGet<Paginated<Withdrawal>>('/withdrawals/pending', cleanQuery(query)),
  getAll: (query: WithdrawalListQuery = {}) =>
    apiGet<Paginated<Withdrawal>>('/withdrawals/all', cleanQuery(query)),
  approve: (id: string, utr?: string, txHash?: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/approve`, { utr, txHash }),
  reject: (id: string, reason: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/reject`, { reason }),
};
