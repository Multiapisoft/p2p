import { apiGet, apiPatch } from '@/shared/api/client';
import type { Paginated, TransactionStatus } from '@/shared/types/api.types';

export interface WithdrawalPaymentAdmin {
  _id: string;
  referenceId: string;
  withdrawalId: {
    _id: string;
    referenceId: string;
    amount: number;
    paidAmount?: number;
    method: string;
    upiDetails?: { upiId?: string };
    bankDetails?: { accountNumber?: string; ifscCode?: string };
  };
  payerUserId: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    role?: string;
    status?: string;
    businessUserCode?: string;
  };
  amount: number;
  currency: string;
  utr: string;
  proofImageUrl: string;
  status: TransactionStatus;
  createdAt: string;
  /** Final cut after approve; falls back to estimate while pending. */
  commissionAmount?: number;
  bonusAmount?: number;
  netCreditedAmount?: number;
  estimatedCommissionAmount?: number;
  estimatedBonusAmount?: number;
  estimatedNetCredited?: number;
}

export type WithdrawalPaymentListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  method?: string;
};

function cleanQuery(query: WithdrawalPaymentListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const withdrawalPaymentsApi = {
  getPending: (query: WithdrawalPaymentListQuery = {}) =>
    apiGet<Paginated<WithdrawalPaymentAdmin>>('/withdrawal-payments/pending', cleanQuery(query)),
  getAll: (query: WithdrawalPaymentListQuery = {}) =>
    apiGet<Paginated<WithdrawalPaymentAdmin>>('/withdrawal-payments/all', cleanQuery(query)),
  approve: (id: string) => apiPatch(`/withdrawal-payments/${id}/approve`),
  reject: (id: string, reason: string) =>
    apiPatch(`/withdrawal-payments/${id}/reject`, { reason }),
};
