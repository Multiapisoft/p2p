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
