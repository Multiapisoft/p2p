import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Paginated } from '@/shared/types/api.types';

export type PayLimitMode = 'set' | 'add' | 'deduct';

export type PayLimitRequest = {
  _id: string;
  businessId:
    | string
    | { _id: string; name?: string; slug?: string; p2pPayLimit?: number };
  mode: PayLimitMode;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  proofImageKey?: string;
  proofImageUrl?: string;
  seedAtRequest?: number;
  requestedBy?: string | { _id: string; name?: string; email?: string; role?: string };
  reviewedBy?: string | { _id: string; name?: string; email?: string; role?: string };
  reviewedAt?: string;
  rejectReason?: string;
  createdAt: string;
};

export type PayLimitRequestListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  status?: string;
};

function cleanQuery(query: PayLimitRequestListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    search: query.search?.trim() || undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
  };
}

export const payLimitRequestsApi = {
  list: (query: PayLimitRequestListQuery = {}) =>
    apiGet<Paginated<PayLimitRequest>>('/business/p2p-pay-limit-requests', cleanQuery(query)),
  create: (
    businessId: string,
    body: {
      p2pPayLimit: number;
      mode?: PayLimitMode;
      notes?: string;
      proofImageKey?: string;
      proofImageUrl?: string;
      applyNow?: boolean;
    },
  ) => apiPost<PayLimitRequest | { request: PayLimitRequest }>(
    `/business/${businessId}/p2p-pay-limit-requests`,
    body,
  ),
  approve: (requestId: string) =>
    apiPatch<{ request: PayLimitRequest }>(
      `/business/p2p-pay-limit-requests/${requestId}/approve`,
    ),
  reject: (requestId: string, reason?: string) =>
    apiPatch<PayLimitRequest>(`/business/p2p-pay-limit-requests/${requestId}/reject`, {
      reason,
    }),
};
