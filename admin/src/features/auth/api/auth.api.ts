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
