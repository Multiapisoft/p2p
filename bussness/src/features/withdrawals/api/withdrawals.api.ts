import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Paginated, PaymentMethod, Withdrawal } from '@/shared/types/api.types';

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
  create: (payload: {
    amount: number;
    method: PaymentMethod;
    upiDetails?: { upiId: string; payerName: string };
    bankDetails?: {
      accountNumber: string;
      ifscCode: string;
      accountHolderName: string;
      bankName: string;
    };
    usdtDetails?: { walletAddress: string; network?: string };
    cdmDetails?: { payerName: string; locationHint?: string; notes?: string };
  }) => apiPost<Withdrawal>('/withdrawals/business', payload),
  getBusinessWithdrawals: (query: WithdrawalsListQuery = {}) =>
    apiGet<Paginated<Withdrawal>>('/withdrawals/business', cleanQuery(query)),
  getById: (id: string) => apiGet<Withdrawal>(`/withdrawals/business/${id}`),
  listForP2p: (id: string) => apiPatch<Withdrawal>(`/withdrawals/${id}/list-for-p2p`, {}),
  unlistForP2p: (id: string, reason?: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/unlist-for-p2p`, { reason }),
  assignPayer: (id: string, assigneeId: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/assign`, { assigneeId }),
  unassignPayer: (id: string) => apiPatch<Withdrawal>(`/withdrawals/${id}/unassign`, {}),
  approve: (
    id: string,
    body?: { utr?: string; txHash?: string; proofImageKey?: string; proofImageUrl?: string },
  ) => apiPatch<Withdrawal>(`/withdrawals/${id}/approve`, body || {}),
  reject: (id: string, reason: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/reject`, { reason }),
};
