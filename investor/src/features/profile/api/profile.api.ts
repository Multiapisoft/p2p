import { apiGet, apiPatch } from '@/shared/api/client';

export const profileApi = {
  getMe: () => apiGet<import('@/shared/types/api.types').User>('/users/me'),
  updateMe: (data: { name?: string; phone?: string }) => apiPatch('/users/me', data),
};
