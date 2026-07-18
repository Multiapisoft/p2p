import { apiPost } from '@/shared/api/client';

export type WalletAdjustType = 'credit' | 'debit';

export const walletApi = {
  adjust: (userId: string, amount: number, type: WalletAdjustType, reason: string) =>
    apiPost('/wallets/adjust', { userId, amount, type, reason }),
};
