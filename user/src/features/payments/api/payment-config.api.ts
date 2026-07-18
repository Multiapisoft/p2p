import { apiGet } from '@/shared/api/client';
import type { PaymentConfig } from '@/shared/types/api.types';

export const paymentConfigApi = {
  getActive: () => apiGet<PaymentConfig[]>('/payment-config/active'),
};
