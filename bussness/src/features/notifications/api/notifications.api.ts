import { apiGet, apiPatch } from '@/shared/api/client';
import type { Notification, Paginated } from '@/shared/types/api.types';

export type NotificationsListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  status?: string;
  unreadOnly?: string;
};

function cleanQuery(query: NotificationsListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    status: query.status && query.status !== 'all' ? query.status : undefined,
    unreadOnly:
      query.unreadOnly && query.unreadOnly !== 'all' ? query.unreadOnly : undefined,
  };
}

export const notificationsApi = {
  getAll: (query: NotificationsListQuery = {}) =>
    apiGet<Paginated<Notification>>('/notifications', cleanQuery(query)),
  getUnreadCount: () => apiGet<{ unreadCount: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiPatch(`/notifications/${id}/read`),
  markAllRead: () => apiPatch('/notifications/read-all'),
};
