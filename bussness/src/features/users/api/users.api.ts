import { apiGet, apiPatch } from '@/shared/api/client';
import type { Paginated, User } from '@/shared/types/api.types';

export type UsersListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
  role?: string;
};

function cleanQuery(query: UsersListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    role: query.role && query.role !== 'all' ? query.role : undefined,
  };
}

export const usersApi = {
  getMe: () => apiGet<User>('/users/me'),
  updateMe: (body: { name?: string; phone?: string }) => apiPatch<User>('/users/me', body),
  getBusinessUsers: (query: UsersListQuery = {}) =>
    apiGet<Paginated<User>>('/business/me/users', cleanQuery(query)),
};
