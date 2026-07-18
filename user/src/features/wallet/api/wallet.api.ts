import { apiGet, apiPatch } from '@/shared/api/client';
import type { Wallet, WalletBalance } from '@/shared/types/api.types';

export const walletApi = {
  getWallets: () => apiGet<Wallet[]>('/wallets'),
  getBalance: () => apiGet<WalletBalance>('/wallets/balance'),
};
