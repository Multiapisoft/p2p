import { apiGet, apiPatch } from '@/shared/api/client';

export interface PlatformSettings {
  investorClaimLockMinutes: number;
  investorPaySubmitMinutes: number;
  withdrawalUserEditTatMinutes: number;
  investorPlanAmounts: number[];
  investorPlanTargetMultiplier: number;
  allowMobileNumberUpi: boolean;
  showCommissionToInvestor: boolean;
  minTransactionAmount: number;
  allowPartialPay: boolean;
  preferB2bSettlement: boolean;
  cdmHoldMinutes: number;
  investorReferralFirstReferrerPercent: number;
  investorReferralFirstJoinerPercent: number;
  investorReferralNextReferrerPercent: number;
  investorReferralNextJoinerPercent: number;
}

export type UpdatePlatformSettingsPayload = Partial<PlatformSettings>;

export const platformSettingsApi = {
  get: () => apiGet<PlatformSettings>('/platform-settings'),
  update: (body: UpdatePlatformSettingsPayload) =>
    apiPatch<PlatformSettings>('/platform-settings', body),
};
