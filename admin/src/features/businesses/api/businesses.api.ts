import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Business, BusinessStats, Paginated } from '@/shared/types/api.types';

export type BusinessListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  status?: string;
};

function cleanQuery(query: BusinessListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
  };
}

export const businessesApi = {
  list: (query: BusinessListQuery = {}) =>
    apiGet<Paginated<Business>>('/business', cleanQuery(query)),
  approve: (id: string) => apiPost<Business>(`/business/${id}/approve`),
  getStats: (id: string) => apiGet<BusinessStats>(`/business/${id}/stats`),
  setP2pPayLimit: (
    id: string,
    p2pPayLimit: number,
    mode: 'set' | 'add' | 'deduct' = 'set',
  ) => apiPatch<Business>(`/business/${id}/p2p-pay-limit`, { p2pPayLimit, mode }),
  setHighlightLimit: (id: string, highlightLimitPerMonth: number) =>
    apiPatch<Business>(`/business/${id}/highlight-limit`, { highlightLimitPerMonth }),
  update: (
    id: string,
    body: Partial<{
      depositsEnabled: boolean;
      withdrawalsEnabled: boolean;
      b2bMatchingEnabled: boolean;
      allowPartialPay: boolean;
      allowMobileNumberUpi: boolean;
      allowedDepositMethods: string[];
      allowedWithdrawalMethods: string[];
    }>,
  ) => apiPatch<Business>(`/business/${id}/txn-flags`, body),
};
