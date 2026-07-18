import { apiGet } from '@/shared/api/client';
import type { AuditLog, Paginated } from '@/shared/types/api.types';

export type AuditListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  /** Maps to action on backend */
  status?: string;
  resource?: string;
};

function cleanQuery(query: AuditListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    status: query.status && query.status !== 'all' ? query.status : undefined,
    resource: query.resource && query.resource !== 'all' ? query.resource : undefined,
  };
}

export const auditApi = {
  getAll: (query: AuditListQuery = {}) =>
    apiGet<Paginated<AuditLog>>('/audit', cleanQuery(query)),
};
