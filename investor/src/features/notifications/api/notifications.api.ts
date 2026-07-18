import { apiGet, apiPatch } from '@/shared/api/client';
import type { Notification, Paginated } from '@/shared/types/api.types';

export type NotificationListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  unreadOnly?: boolean | 'all' | 'unread';
};

export const notificationsApi = {
  getAll: (query: NotificationListQuery = {}) =>
    apiGet<Paginated<Notification>>('/notifications', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search?.trim() || undefined,
      sort: query.sort || 'newest',
      unreadOnly:
        query.unreadOnly === true || query.unreadOnly === 'unread' ? 'true' : undefined,
    }),
  getUnreadCount: () => apiGet<{ unreadCount: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiPatch(`/notifications/${id}/read`),
  markAllRead: () => apiPatch('/notifications/read-all'),
};
