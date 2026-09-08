import { apiGet, apiPatch } from '@/shared/api/client';
import type { Deposit, DepositSummaryRow, Paginated } from '@/shared/types/api.types';

export type DepositsListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
  method?: string;
};

function cleanQuery(query: DepositsListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const depositsApi = {
  getBusinessDeposits: (query: DepositsListQuery = {}) =>
    apiGet<Paginated<Deposit>>('/deposits/business', cleanQuery(query)),
  getBusinessSummary: () => apiGet<DepositSummaryRow[]>('/deposits/business/summary'),
  getById: (id: string) => apiGet<Deposit>(`/deposits/business/${id}`),
  approve: (id: string, utr?: string, txHash?: string) =>
    apiPatch<Deposit>(`/deposits/business/${id}/approve`, { utr, txHash }),
  reject: (id: string, reason: string) =>
    apiPatch<Deposit>(`/deposits/business/${id}/reject`, { reason }),
};
