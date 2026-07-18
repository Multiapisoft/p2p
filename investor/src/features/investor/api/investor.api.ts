import { apiGet, apiPost } from '@/shared/api/client';
import type {
  CreateRedemptionPayload,
  Investment,
  Paginated,
  Portfolio,
  Redemption,
} from '@/shared/types/api.types';
import type { PaymentMethod } from '@/shared/types/api.types';

export type InvestorListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
  method?: string;
};

function cleanInvestorQuery(query: InvestorListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const investorApi = {
  getPortfolio: () => apiGet<Portfolio>('/investor/portfolio'),
  getRedeemable: () => apiGet<Portfolio>('/investor/redeemable'),
  invest: (amount: number, method: PaymentMethod, note?: string) =>
    apiPost<Investment>('/investor/invest', { amount, method, note }),
  getInvestments: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<Investment>>('/investor/investments', cleanInvestorQuery(query)),
  redeem: (payload: CreateRedemptionPayload) =>
    apiPost<Redemption>('/investor/redeem', payload),
  getRedemptions: (query: InvestorListQuery = {}) =>
    apiGet<Paginated<Redemption>>('/investor/redemptions', cleanInvestorQuery(query)),
};
