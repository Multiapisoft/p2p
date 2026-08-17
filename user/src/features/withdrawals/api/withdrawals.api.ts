import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { CreateWithdrawalPayload, Paginated, Withdrawal } from '@/shared/types/api.types';

export type WithdrawalListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
  method?: string;
};

export const withdrawalsApi = {
  getMy: (query: WithdrawalListQuery = {}) =>
    apiGet<Paginated<Withdrawal>>('/withdrawals', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      status: query.status && query.status !== 'all' ? query.status : undefined,
      search: query.search?.trim() || undefined,
      sort: query.sort || 'newest',
      method: query.method && query.method !== 'all' ? query.method : undefined,
    }),
  create: (payload: CreateWithdrawalPayload) => apiPost<Withdrawal>('/withdrawals', payload),
  updateDestination: (
    id: string,
    payload: Pick<CreateWithdrawalPayload, 'upiDetails' | 'bankDetails' | 'usdtDetails'>,
  ) => apiPatch<Withdrawal>(`/withdrawals/${id}/destination`, payload),
  cancel: (id: string) => apiPatch<Withdrawal>(`/withdrawals/${id}/cancel`),
  confirmPaymentReceived: (paymentId: string) =>
    apiPatch(`/withdrawal-payments/${paymentId}/confirm-received`),
  disputePayment: (paymentId: string, reason?: string) =>
    apiPost(`/withdrawal-payments/${paymentId}/dispute`, reason ? { reason } : {}),
};
