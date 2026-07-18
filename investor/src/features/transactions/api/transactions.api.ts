import { apiGet } from '@/shared/api/client';
import type { LedgerEntry, Paginated } from '@/shared/types/api.types';

export type TransactionListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  type?: string;
};

export const transactionsApi = {
  getAll: (query: TransactionListQuery = {}) =>
    apiGet<Paginated<LedgerEntry>>('/transactions', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search?.trim() || undefined,
      sort: query.sort || 'newest',
      type: query.type && query.type !== 'all' ? query.type : undefined,
    }),
};
