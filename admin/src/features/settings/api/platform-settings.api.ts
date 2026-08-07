import { apiGet, apiPatch } from '@/shared/api/client';

export interface PlatformSettings {
  investorClaimLockMinutes: number;
  investorPaySubmitMinutes: number;
  withdrawalUserEditTatMinutes: number;
  investorPlanAmounts: number[];
  investorPlanTargetMultiplier: number;
}

export type UpdatePlatformSettingsPayload = Partial<PlatformSettings>;

export const platformSettingsApi = {
  get: () => apiGet<PlatformSettings>('/platform-settings'),
  update: (body: UpdatePlatformSettingsPayload) =>
    apiPatch<PlatformSettings>('/platform-settings', body),
};
