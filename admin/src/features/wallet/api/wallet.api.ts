import { apiGet, apiPost } from '@/shared/api/client';

export type WalletAdjustType = 'credit' | 'debit';

export type WalletSummary = {
  _id: string;
  currency: string;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
};

export type WalletUserLookup = {
  user: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    status: string;
  };
  wallet: WalletSummary;
  wallets: WalletSummary[];
};

export type WalletAdjustResult = WalletSummary & {
  userId: string;
  type: WalletAdjustType;
  amount: number;
  reason: string;
};

export const walletApi = {
  getByUser: (userId: string) =>
    apiGet<WalletUserLookup>(`/wallets/by-user/${userId}`),

  getPlatform: () =>
    apiGet<{
      admin: { _id: string; name: string; email: string; role: string };
      wallet: WalletSummary;
    }>('/wallets/platform'),

  adjust: (payload: {
    userId?: string;
    email?: string;
    phone?: string;
    amount: number;
    type: WalletAdjustType;
    reason: string;
    currency?: string;
  }) => apiPost<WalletAdjustResult>('/wallets/adjust', payload),

  resetTxnData: (payload: {
    entityType: 'user' | 'investor' | 'business';
    entityId?: string;
    email?: string;
    phone?: string;
    confirm: string;
  }) =>
    apiPost<{
      ok: boolean;
      users: number;
      cancelledWithdrawals: number;
      cancelledDeposits: number;
    }>('/wallets/reset-txn-data', payload),
};
