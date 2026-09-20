import axios from 'axios';
import { useAuthStore } from '@/features/auth/store/auth.store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const url = String(error.config?.url || '');
      const isAuthAttempt =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password');
      if (!isAuthAttempt) {
        const persistApi = useAuthStore.persist;
        if (persistApi && !persistApi.hasHydrated()) {
          return Promise.reject(error);
        }
        useAuthStore.getState().logout();
        const next = `${window.location.pathname}${window.location.search || ''}`;
        window.location.href = next.startsWith('/login')
          ? '/login'
          : `/login?next=${encodeURIComponent(next)}`;
      }
    }
    return Promise.reject(error);
  },
);

export async function apiGet<T>(url: string, params?: Record<string, unknown>) {
  const { data } = await apiClient.get<{ data: T }>(url, { params });
  return data.data;
}

export async function apiPost<T>(url: string, body?: unknown) {
  const { data } = await apiClient.post<{ data: T }>(url, body);
  return data.data;
}

export async function apiPatch<T>(url: string, body?: unknown) {
  const { data } = await apiClient.patch<{ data: T }>(url, body);
  return data.data;
}
