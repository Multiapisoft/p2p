import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { PaymentConfig } from '@/shared/types/api.types';

export const paymentsApi = {
  getAll: () => apiGet<PaymentConfig[]>('/payment-config'),
  create: (body: {
    method: string;
    label: string;
    currency?: string;
    minAmount?: number;
    maxAmount?: number;
    details: Record<string, string>;
    instructions?: string;
  }) => apiPost<PaymentConfig>('/payment-config', body),
  update: (id: string, body: Partial<PaymentConfig & { instructions?: string }>) =>
    apiPatch<PaymentConfig>(`/payment-config/${id}`, body),
};
