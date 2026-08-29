import { apiGet } from '@/shared/api/client';
import type { LedgerEntry, Paginated } from '@/shared/types/api.types';

export type TransactionListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  type?: string;
  userId?: string;
};

function cleanQuery(query: TransactionListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    type: query.type && query.type !== 'all' ? query.type : undefined,
    userId: query.userId?.trim() || undefined,
  };
}

export const transactionsApi = {
  getAll: (query: TransactionListQuery = {}) =>
    apiGet<Paginated<LedgerEntry>>('/transactions/admin/all', cleanQuery(query)),
  getMine: (query: TransactionListQuery = {}) =>
    apiGet<Paginated<LedgerEntry>>('/transactions', cleanQuery(query)),
};
