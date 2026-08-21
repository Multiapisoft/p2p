import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Notification, Paginated, SavedWithdrawalMethod, User } from '@/shared/types/api.types';

export const profileApi = {
  getMe: () => apiGet<User>('/users/me'),
  updateMe: (payload: { name?: string; phone?: string }) => apiPatch<User>('/users/me', payload),
  attachReferral: (referralCode: string) =>
    apiPatch<User>('/users/me/referral', { referralCode }),
  getWithdrawalMethods: () =>
    apiGet<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods'),
  saveWithdrawalMethod: (payload: {
    label?: string;
    method: 'upi' | 'bank' | 'usdt';
    isDefault?: boolean;
    upiDetails?: { upiId: string; payerName: string };
    bankDetails?: { accountNumber: string; ifscCode: string; accountHolderName: string; bankName: string };
    usdtDetails?: { walletAddress: string; network?: string };
  }) => apiPost<{ items: SavedWithdrawalMethod[] }>('/users/me/withdrawal-methods', payload),
  updateWithdrawalMethod: (
    methodId: string,
    payload: {
      label?: string;
      method: 'upi' | 'bank' | 'usdt';
      isDefault?: boolean;
      upiDetails?: { upiId: string; payerName: string };
      bankDetails?: { accountNumber: string; ifscCode: string; accountHolderName: string; bankName: string };
      usdtDetails?: { walletAddress: string; network?: string };
    },
  ) => apiPatch<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}`, payload),
  setDefaultWithdrawalMethod: (methodId: string) =>
    apiPatch<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/default`),
  deleteWithdrawalMethod: (methodId: string) =>
    apiPost<{ items: SavedWithdrawalMethod[] }>(`/users/me/withdrawal-methods/${methodId}/delete`),
};

export type NotificationListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  unread?: boolean;
  read?: boolean;
};

export const notificationsApi = {
  getAll: (query: NotificationListQuery = {}) =>
    apiGet<Paginated<Notification>>('/notifications', {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search?.trim() || undefined,
      sort: query.sort || 'newest',
      unread: query.unread === true ? true : undefined,
      read: query.read === true ? true : undefined,
    }),
  getUnreadCount: () => apiGet<{ unreadCount: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiPatch(`/notifications/${id}/read`),
  markAllRead: () => apiPatch('/notifications/read-all'),
};
