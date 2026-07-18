import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type {
  BusinessProfile,
  BusinessStats,
  BusinessOverview,
  CreateBusinessResponse,
  RegenerateKeysResponse,
  PaymentMethod,
  User,
  IntegrationUrls,
  IntegrationConfig,
} from '@/shared/types/api.types';

export const businessApi = {
  getMe: () => apiGet<BusinessProfile>('/business/me'),
  create: (body: {
    name: string;
    slug?: string;
    description?: string;
    webhookUrl?: string;
    commissionRate?: number;
    allowedPaymentMethods?: PaymentMethod[];
    partnerApi: {
      baseUrl?: string;
      balanceUrl?: string;
      creditUrl?: string;
      debitUrl?: string;
    };
  }) => apiPost<CreateBusinessResponse>('/business', body),
  update: (body: {
    name?: string;
    description?: string;
    webhookUrl?: string;
    commissionRate?: number;
    allowedPaymentMethods?: PaymentMethod[];
    integrationUrls?: IntegrationUrls;
  }) => apiPatch<BusinessProfile>('/business/me', body),
  regenerateKeys: () => apiPost<RegenerateKeysResponse>('/business/me/regenerate-keys'),
  regenerateInternalKeys: () =>
    apiPost<{ internalSecret: string }>('/business/me/regenerate-internal-keys'),
  getStats: () => apiGet<BusinessStats>('/business/me/stats'),
  getOverview: () => apiGet<BusinessOverview>('/deposits/business/overview'),
  getUsers: (page = 1) =>
    apiGet<{ items: User[]; total: number; page: number; limit: number; totalPages: number }>(
      '/business/me/users',
      { page, limit: 20 },
    ),
  testWebhook: () => apiPost<{ success: boolean; message?: string }>('/business/me/webhook/test'),
  getIntegrationConfig: () => apiGet<IntegrationConfig>('/business/me/integration/config'),
  updateIntegrationUrls: (integrationUrls: IntegrationUrls) =>
    apiPatch<BusinessProfile>('/business/me/integration-urls', { integrationUrls }),
  getPartnerApi: () =>
    apiGet<{
      baseUrl: string | null;
      balanceUrl: string | null;
      creditUrl: string | null;
      debitUrl: string | null;
      apiKey: string;
      configured: boolean;
    }>('/business/me/partner-api'),
  updatePartnerApi: (body: {
    baseUrl?: string;
    balanceUrl?: string;
    creditUrl?: string;
    debitUrl?: string;
  }) =>
    apiPatch<{
      partnerApi: {
        baseUrl?: string;
        balanceUrl: string;
        creditUrl: string;
        debitUrl: string;
        apiKey: string;
        linked: boolean;
      };
    }>('/business/me/partner-api', body),
};
