import { apiGet, apiPatch } from '@/shared/api/client';
import type { User, Paginated } from '@/shared/types/api.types';

export type UserListQuery = {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  sort?: string;
  status?: string;
};

function cleanQuery(query: UserListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    role: query.role && query.role !== 'all' ? query.role : undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
  };
}

export const usersApi = {
  list: (query: UserListQuery = {}) =>
    apiGet<Paginated<User>>('/users', cleanQuery(query)),
  getById: (id: string) => apiGet<User>(`/users/${id}`),
  updateStatus: (id: string, status: string) =>
    apiPatch<User>(`/admin/users/${id}/status`, { status }),
};
