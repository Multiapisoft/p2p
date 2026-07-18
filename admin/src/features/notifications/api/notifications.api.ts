import { apiGet, apiPatch } from '@/shared/api/client';
import type { Notification, Paginated } from '@/shared/types/api.types';

export const notificationsApi = {
  getAll: (page = 1) => apiGet<Paginated<Notification>>('/notifications', { page, limit: 10 }),
  getUnreadCount: () => apiGet<{ unreadCount: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiPatch(`/notifications/${id}/read`),
  markAllRead: () => apiPatch('/notifications/read-all'),
};
