import { apiPost } from '@/shared/api/client';
import type { AuthUser, BusinessProfile } from '@/shared/types/api.types';

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
  referralCode?: string;
  business?: BusinessProfile;
  apiKey?: string;
  apiSecret?: string;
  internalSecret?: string;
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
  phone?: string;
  businessName?: string;
}) {
  return apiPost<AuthResponse>('/auth/register', {
    ...data,
    role: 'business',
    businessName: data.businessName,
  });
}
