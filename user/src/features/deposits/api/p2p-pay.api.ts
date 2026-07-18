import { apiGet, apiPost } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { Paginated, PaymentMethod, TransactionStatus } from '@/shared/types/api.types';

export interface CreditPreview {
  payAmount: number;
  payCurrency?: string;
  payAmountInr?: number;
  commissionAmount: number;
  businessCommission: number;
  platformCommission: number;
  principalCredit: number;
  bonusAmount: number;
  netCredited: number;
  creditCurrency?: string;
  exchangeRate?: number | null;
  isInvestor: boolean;
  businessId: string | null;
}

export interface AvailableWithdrawal {
  _id: string;
  referenceId: string;
  amount: number;
  paidAmount: number;
  reservedAmount?: number;
  remainingAmount: number;
  currency: string;
  method: PaymentMethod;
  status: TransactionStatus;
  upiDetails?: { upiId?: string; payerName?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string };
  createdAt: string;
  creditIfPayFull?: {
    payAmount: number;
    payCurrency?: string;
    payAmountInr?: number;
    commissionAmount: number;
    bonusAmount: number;
    netCredited: number;
    principalCredit: number;
    creditCurrency?: string;
    exchangeRate?: number | null;
  } | null;
}

export interface P2pPayment {
  _id: string;
  referenceId: string;
  withdrawalId: string;
  amount: number;
  currency: string;
  utr: string;
  proofImageUrl: string;
  status: TransactionStatus;
  commissionAmount?: number;
  bonusAmount?: number;
  netCreditedAmount?: number;
  rejectionReason?: string;
  createdAt: string;
}

export type P2pListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  method?: string;
  status?: string;
};

function cleanQuery(query: P2pListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
  };
}

export const p2pPayApi = {
  getAvailable: (query: P2pListQuery = {}) =>
    apiGet<Paginated<AvailableWithdrawal>>(
      '/withdrawal-payments/available-withdrawals',
      cleanQuery(query),
    ),
  previewCredit: (amount: number, withdrawalId?: string) =>
    apiGet<CreditPreview>('/withdrawal-payments/credit-preview', {
      amount,
      withdrawalId,
    }),
  submitPayment: (
    withdrawalId: string,
    payload: { amount: number; utr: string; proofImageKey: string; proofImageUrl: string },
  ) => apiPost<P2pPayment>(`/withdrawal-payments/withdrawal/${withdrawalId}`, payload),
  getMyPayments: (query: P2pListQuery = {}) =>
    apiGet<Paginated<P2pPayment>>('/withdrawal-payments/mine', cleanQuery(query)),
  uploadProof: async (file: File, purpose = 'withdrawal-payment-proof') => {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', purpose);

    const token = useAuthStore.getState().token;
    const base = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
    const res = await fetch(`${base}/uploads/proof`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    const json = (await res.json().catch(() => null)) as {
      data?: { key: string; publicUrl: string };
      message?: string | string[];
    } | null;

    if (!res.ok) {
      const msg = json?.message;
      throw new Error(Array.isArray(msg) ? msg.join(', ') : msg || 'Upload failed');
    }
    if (!json?.data?.key) throw new Error('Upload failed');
    return json.data;
  },
};
