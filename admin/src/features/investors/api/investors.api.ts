import { apiGet, apiPatch } from '@/shared/api/client';
import type { Redemption, Investment, Paginated, TransactionStatus } from '@/shared/types/api.types';

export type InvestorListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  method?: string;
  status?: string;
};

export interface InvestorPayRecord {
  _id: string;
  referenceId: string;
  amount: number;
  currency?: string;
  utr?: string;
  status: TransactionStatus;
  createdAt: string;
  payerUserId:
    | string
    | {
        _id: string;
        name?: string;
        email?: string;
        phone?: string;
      };
  withdrawalId?:
    | string
    | {
        _id: string;
        referenceId?: string;
        method?: string;
      };
}

function cleanQuery(query: InvestorListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
  };
}

export const investorsApi = {
  getPendingRedemptions: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<Redemption>>('/investor/redemptions/pending', cleanQuery(query)),
  getPendingInvestments: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<Investment>>('/investor/investments/pending', cleanQuery(query)),
  getAllInvestments: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<Investment>>('/investor/investments/all', cleanQuery(query)),
  getInvestorPayments: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<InvestorPayRecord>>('/investor/payments', cleanQuery(query)),
  approveRedemption: (id: string) =>
    apiPatch<Redemption>(`/investor/redemptions/${id}/approve`, {}),
  rejectRedemption: (id: string, reason: string) =>
    apiPatch<Redemption>(`/investor/redemptions/${id}/reject`, { reason }),
  approveInvestment: (id: string) =>
    apiPatch<Investment>(`/investor/investments/${id}/approve`, {}),
  rejectInvestment: (id: string, reason: string) =>
    apiPatch<Investment>(`/investor/investments/${id}/reject`, { reason }),
};
