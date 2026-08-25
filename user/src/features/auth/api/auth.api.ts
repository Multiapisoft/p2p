import { apiPost } from '@/shared/api/client';
import type { AuthUser } from '@/shared/types/api.types';

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export async function loginApi(email: string, password: string, totpCode?: string) {
  return apiPost<AuthResponse>('/auth/login', {
    email: email.trim().toLowerCase(),
    password,
    ...(totpCode ? { totpCode } : {}),
  });
}

export async function registerApi(payload: {
  email: string;
  password: string;
  name: string;
  phone: string;
  referralCode?: string;
}) {
  return apiPost<AuthResponse>('/auth/register', { ...payload, role: 'user' });
}

export async function setPasswordApi(newPassword: string, currentPassword?: string) {
  return apiPost<AuthResponse>('/auth/set-password', {
    newPassword,
    ...(currentPassword ? { currentPassword } : {}),
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
