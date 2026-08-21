import { apiGet } from '@/shared/api/client';
import type { Paginated } from '@/shared/types/api.types';

export type BusinessPlatformPayment = {
  _id: string;
  referenceId: string;
  amount: number;
  currency: string;
  status: string;
  utr?: string;
  proofImageUrl?: string;
  notes?: string;
  rejectionReason?: string;
  commissionAmount?: number;
  bonusAmount?: number;
  netCreditedAmount?: number;
  createdAt?: string;
  completedAt?: string;
  payerUserId?:
    | {
        name?: string;
        email?: string;
        phone?: string;
        role?: string;
        status?: string;
        businessUserCode?: string;
        externalRef?: string;
      }
    | string;
  withdrawalId?: {
    referenceId?: string;
    method?: string;
    amount?: number;
    currency?: string;
    status?: string;
    paidAmount?: number;
    createdAt?: string;
    completedAt?: string;
    p2pListStatus?: string;
    origin?: string;
    upiDetails?: { upiId?: string; payerName?: string; utr?: string };
    bankDetails?: {
      accountNumber?: string;
      ifscCode?: string;
      accountHolderName?: string;
      bankName?: string;
      utr?: string;
    };
    usdtDetails?: { walletAddress?: string; network?: string; txHash?: string };
    userId?:
      | {
          name?: string;
          email?: string;
          phone?: string;
          role?: string;
          status?: string;
          businessUserCode?: string;
          externalRef?: string;
        }
      | string;
  } | string;
};

export const platformPaymentsApi = {
  list: (query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    sort?: string;
    method?: string;
  } = {}) =>
    apiGet<Paginated<BusinessPlatformPayment>>('/withdrawal-payments/business', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      status: query.status && query.status !== 'all' ? query.status : undefined,
      search: query.search?.trim() || undefined,
      sort: query.sort || 'newest',
      method: query.method && query.method !== 'all' ? query.method : undefined,
    }),
};
