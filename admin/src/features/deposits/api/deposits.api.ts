import { apiGet, apiPatch } from '@/shared/api/client';
import type { Deposit, Paginated } from '@/shared/types/api.types';

export type DepositListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  method?: string;
};

function cleanQuery(query: DepositListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const depositsApi = {
  getPending: (query: DepositListQuery = {}) =>
    apiGet<Paginated<Deposit>>('/deposits/pending', cleanQuery(query)),
  getAll: (query: DepositListQuery = {}) =>
    apiGet<Paginated<Deposit>>('/deposits/all', cleanQuery(query)),
  getById: (id: string) => apiGet<Deposit>(`/deposits/${id}`),
  approve: (id: string, utr?: string, txHash?: string) =>
    apiPatch<Deposit>(`/deposits/${id}/approve`, { utr, txHash }),
  reject: (id: string, reason: string) =>
    apiPatch<Deposit>(`/deposits/${id}/reject`, { reason }),
};
