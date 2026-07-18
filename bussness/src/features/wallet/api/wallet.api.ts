import { apiGet } from '@/shared/api/client';

export interface WalletBalance {
  availableBalance: number;
  redeemableAmount: number;
  lockedBalance?: number;
  balance?: number;
  currency?: string;
  source?: string;
}

export const walletApi = {
  getBalance: () => apiGet<WalletBalance>('/wallets/balance'),
};
