import { apiGet } from '@/shared/api/client';
import type { Paginated } from '@/shared/types/api.types';

export type BusinessPlatformPayment = {
  _id: string;
  referenceId: string;
  amount: number;
  currency: string;
  status: string;
  utr?: string;
  createdAt?: string;
  completedAt?: string;
  payerUserId?: { name?: string; email?: string; businessUserCode?: string } | string;
  withdrawalId?: {
    referenceId?: string;
    method?: string;
    amount?: number;
    currency?: string;
  } | string;
};

export const platformPaymentsApi = {
  list: (query: { page?: number; limit?: number; status?: string } = {}) =>
    apiGet<Paginated<BusinessPlatformPayment>>('/withdrawal-payments/business', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      status: query.status && query.status !== 'all' ? query.status : undefined,
    }),
};
