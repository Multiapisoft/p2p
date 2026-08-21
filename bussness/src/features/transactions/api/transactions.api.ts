import { apiGet } from '@/shared/api/client';
import type { LedgerEntry, Paginated } from '@/shared/types/api.types';

export type TransactionsListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  type?: string;
};

function cleanQuery(query: TransactionsListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    type: query.type && query.type !== 'all' ? query.type : undefined,
  };
}

export const transactionsApi = {
  getMy: (query: TransactionsListQuery = {}) =>
    apiGet<Paginated<LedgerEntry>>('/transactions/business', cleanQuery(query)),
};
