import { apiPost } from '@/shared/api/client';
import type { AuthUser } from '@/shared/types/api.types';

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function loginApi(email: string, password: string, totpCode?: string) {
  return apiPost<LoginResponse>('/auth/login', {
    email,
    password,
    ...(totpCode ? { totpCode } : {}),
  });
}

export async function forgotPasswordApi(email: string) {
  return apiPost<{ message: string; resetCode?: string }>('/auth/forgot-password', {
    email: email.trim().toLowerCase(),
  });
}

export async function resetPasswordApi(email: string, code: string, newPassword: string) {
  return apiPost<{ message: string }>('/auth/reset-password', {
    email: email.trim().toLowerCase(),
    code,
    newPassword,
  });
}
