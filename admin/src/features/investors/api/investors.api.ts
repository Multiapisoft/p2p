import { apiGet, apiPatch } from '@/shared/api/client';
import type { Redemption, Investment, Paginated } from '@/shared/types/api.types';

export type InvestorListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  method?: string;
};

function cleanQuery(query: InvestorListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const investorsApi = {
  getPendingRedemptions: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<Redemption>>('/investor/redemptions/pending', cleanQuery(query)),
  getPendingInvestments: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<Investment>>('/investor/investments/pending', cleanQuery(query)),
  approveRedemption: (id: string) =>
    apiPatch<Redemption>(`/investor/redemptions/${id}/approve`, {}),
  rejectRedemption: (id: string, reason: string) =>
    apiPatch<Redemption>(`/investor/redemptions/${id}/reject`, { reason }),
  approveInvestment: (id: string) =>
    apiPatch<Investment>(`/investor/investments/${id}/approve`, {}),
  rejectInvestment: (id: string, reason: string) =>
    apiPatch<Investment>(`/investor/investments/${id}/reject`, { reason }),
};
