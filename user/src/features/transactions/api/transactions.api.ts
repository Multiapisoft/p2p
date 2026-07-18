import { apiGet } from '@/shared/api/client';
import type { LedgerEntry, Paginated } from '@/shared/types/api.types';

export type TransactionListQuery = {
  page?: number;
  limit?: number;
  type?: string;
  search?: string;
  sort?: string;
};

export const transactionsApi = {
  getMy: (query: TransactionListQuery = {}) =>
    apiGet<Paginated<LedgerEntry>>('/transactions', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      type: query.type && query.type !== 'all' ? query.type : undefined,
      search: query.search?.trim() || undefined,
      sort: query.sort || 'newest',
    }),
};
