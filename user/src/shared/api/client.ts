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
      // Don't bounce the login/register screen on bad credentials
      const isAuthAttempt =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password');
      if (!isAuthAttempt) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export async function apiGet<T>(url: string, params?: Record<string, unknown>) {
  const { data } = await apiClient.get<unknown>(url, { params });
  return unwrapData<T>(data);
}

export async function apiPost<T>(url: string, body?: unknown) {
  const { data } = await apiClient.post<unknown>(url, body);
  return unwrapData<T>(data);
}

export async function apiPatch<T>(url: string, body?: unknown) {
  const { data } = await apiClient.patch<unknown>(url, body);
  return unwrapData<T>(data);
}

/** Support both `{ data: T }` envelope and raw `T` payloads. */
function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data: T }).data;
    if (inner !== undefined) return inner;
  }
  return payload as T;
}
