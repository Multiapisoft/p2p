import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import type { Commission, CommissionRuleInput } from '@/shared/types/api.types';

export const commissionsApi = {
  getAll: () => apiGet<Commission[]>('/commissions'),
  getForTarget: (targetType: string, targetId?: string) =>
    apiGet<Commission[]>('/commissions', { targetType, targetId }),
  create: (body: {
    targetType: string;
    percentage: number;
    fixedFee?: number;
    feeMode?: string;
    description?: string;
    paymentMethod?: string;
    targetId?: string;
    minAmount?: number;
    maxAmount?: number;
  }) => apiPost<Commission>('/commissions', body),
  update: (
    id: string,
    body: {
      percentage?: number;
      fixedFee?: number;
      feeMode?: string;
      isActive?: boolean;
      description?: string;
      minAmount?: number | null;
      maxAmount?: number | null;
    },
  ) => apiPatch<Commission>(`/commissions/${id}`, body),
  upsertBusiness: (
    businessId: string,
    body: {
      businessTake?: CommissionRuleInput[];
      investorBonus?: CommissionRuleInput[];
      p2pPayLimit?: number;
    },
  ) =>
    apiPost<{
      businessTake: Commission[];
      investorBonus: Commission[];
      p2pPayLimit: number;
      p2pPayEarned: number;
      p2pPayUsed: number;
      p2pPayRemaining: number | null;
    }>(`/commissions/business/${businessId}`, body),
  getBusiness: (businessId: string) =>
    apiGet<{
      businessTake: Commission[];
      investorBonus: Commission[];
      p2pPayLimit: number;
      p2pPayEarned: number;
      p2pPayUsed: number;
      p2pPayRemaining: number | null;
    }>(`/commissions/business/${businessId}`),
};
