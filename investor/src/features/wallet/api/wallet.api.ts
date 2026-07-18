import { apiGet } from '@/shared/api/client';
import type { WalletBalance } from '@/shared/types/api.types';

export const walletApi = {
  getBalance: () => apiGet<WalletBalance>('/wallets/balance'),
};
