import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { CreateDepositPayload, Deposit, Paginated } from '@/shared/types/api.types';

export type DepositListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
};

export const depositsApi = {
  getMy: (query: DepositListQuery = {}) =>
    apiGet<Paginated<Deposit>>('/deposits', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      status: query.status && query.status !== 'all' ? query.status : undefined,
      search: query.search?.trim() || undefined,
      sort: query.sort || 'newest',
    }),
  getById: (id: string) => apiGet<Deposit>(`/deposits/${id}`),
  create: (payload: CreateDepositPayload) => apiPost<Deposit>('/deposits', payload),
  cancel: (id: string) => apiPatch<Deposit>(`/deposits/${id}/cancel`),
};
