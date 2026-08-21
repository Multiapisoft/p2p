import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
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
  getById: (id: string) => apiGet<Withdrawal>(`/withdrawals/${id}`),
  approve: (id: string, utr?: string, txHash?: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/approve`, { utr, txHash }),
  reject: (id: string, reason: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/reject`, { reason }),
  listForP2p: (id: string) => apiPatch<Withdrawal>(`/withdrawals/${id}/list-for-p2p`, {}),
  unlistForP2p: (id: string, reason?: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/unlist-for-p2p`, { reason }),
  assignPayer: (id: string, assigneeId: string) =>
    apiPatch<Withdrawal>(`/withdrawals/${id}/assign`, { assigneeId }),
  unassignPayer: (id: string) => apiPatch<Withdrawal>(`/withdrawals/${id}/unassign`, {}),
  payAsAdmin: (id: string, body: { amount: number; utr: string }) =>
    apiPost(`/withdrawal-payments/withdrawal/${id}`, body),
  createPlatformCommission: (payload: {
    amount: number;
    method: 'upi' | 'bank' | 'usdt';
    upiDetails?: { upiId: string; payerName: string };
    bankDetails?: {
      accountNumber: string;
      ifscCode: string;
      accountHolderName: string;
      bankName: string;
    };
    usdtDetails?: { walletAddress: string; network?: string };
  }) => apiPost<Withdrawal>('/withdrawals/platform', payload),
};
