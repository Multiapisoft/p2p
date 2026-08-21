import { apiPost } from '@/shared/api/client';
import type { AuthUser } from '@/shared/types/api.types';

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export async function loginApi(email: string, password: string, totpCode?: string) {
  return apiPost<AuthResponse>('/auth/login', {
    email,
    password,
    ...(totpCode ? { totpCode } : {}),
  });
}

export async function registerApi(data: {
  email: string;
  password: string;
  name: string;
  phone: string;
}) {
  return apiPost<AuthResponse>('/auth/register', { ...data, role: 'investor' });
}
