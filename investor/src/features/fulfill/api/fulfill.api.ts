import { apiGet, apiPatch, apiPost } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { Paginated, PaymentMethod, TransactionStatus } from '@/shared/types/api.types';

export interface CreditPreview {
  payAmount: number;
  payCurrency?: string;
  payAmountInr?: number;
  principalCredit: number;
  bonusAmount: number;
  bonusPercentage?: number;
  bonusInPayCurrency?: number;
  netCredited: number;
  creditCurrency?: string;
  exchangeRate?: number | null;
  isInvestor: boolean;
  businessId: string | null;
  maxPayable?: number;
  p2pPayRemainingInr?: number | null;
  withdrawalRemaining?: number | null;
}

export interface AvailableWithdrawal {
  _id: string;
  referenceId: string;
  amount: number;
  /** Confirmed / received amount (unlocked from request). */
  paidAmount: number;
  approvedAmount?: number;
  /** Pending verify — shown as Locked. */
  reservedAmount?: number;
  remainingAmount: number;
  /** Cap by business P2P pay limit (and open amount). */
  maxPayable?: number;
  /** Business P2P INR quota left (null = unlimited). */
  p2pPayRemainingInr?: number | null;
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
  claimLockedBy?: string | null;
  claimLockedUntil?: string | null;
  claimPayDeadline?: string | null;
  origin?: 'user' | 'investor' | 'business';
  assignedToMe?: boolean;
  priority?: boolean;
  /** Estimated wallet credit if you pay maxPayable (after verify, INR points) */
  creditIfPayFull?: {
    payAmount: number;
    payCurrency?: string;
    payAmountInr?: number;
    bonusAmount: number;
    netCredited: number;
    principalCredit: number;
    creditCurrency?: string;
    exchangeRate?: number | null;
  } | null;
}

export interface InvestorLimitLot {
  amount: number;
  remaining: number;
  createdAt: string;
}

export interface InvestorLimitSnapshot {
  lots: InvestorLimitLot[];
  remaining: number;
  added: number;
  needsLimit: boolean;
}

export interface AvailableWithdrawalsResponse extends Paginated<AvailableWithdrawal> {
  needsLimit?: boolean;
  needsPlan?: boolean;
  needsAmount?: boolean;
  waitingForMatch?: boolean;
  matchAmount?: number | null;
  lots?: InvestorLimitLot[];
  limitRemaining?: number | null;
  limitAdded?: number | null;
  planAmount?: number | null;
  targetAmount?: number | null;
  paidTowardPlan?: number | null;
  claimLockMinutes?: number;
  paySubmitMinutes?: number;
  showCommissionToInvestor?: boolean;
  allowMobileNumberUpi?: boolean;
}

export interface ClaimWithdrawalResult extends AvailableWithdrawal {
  claimLockedBy: string;
  claimLockedUntil: string;
  claimPayDeadline: string;
  claimLockMs: number;
  paySubmitMs: number;
}

export interface FulfillmentPayment {
  _id: string;
  referenceId: string;
  withdrawalId: string;
  payerUserId: string;
  amount: number;
  currency: string;
  utr: string;
  proofImageUrl: string;
  status: TransactionStatus;
  bonusAmount?: number;
  netCreditedAmount?: number;
  estimatedNetCredited?: number;
  estimatedBonusAmount?: number;
  rejectionReason?: string;
  createdAt: string;
}

export interface PresignResponse {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;
}

export interface SubmitPaymentPayload {
  amount: number;
  utr?: string;
  proofImageKey?: string;
  proofImageUrl?: string;
}

export type FulfillListQuery = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sort?: string;
  method?: string;
  amount?: number;
};

function cleanFulfillQuery(query: FulfillListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'newest',
    method: query.method && query.method !== 'all' ? query.method : undefined,
    amount: query.amount != null && query.amount >= 1 ? query.amount : undefined,
  };
}

export const fulfillApi = {
  getAvailable: (query: FulfillListQuery = {}) =>
    apiGet<AvailableWithdrawalsResponse>(
      '/withdrawal-payments/available-withdrawals',
      cleanFulfillQuery(query),
    ),
  addInvestorLimit: (amount: number) =>
    apiPost<InvestorLimitSnapshot>('/users/me/investor-limit', { amount }),
  setInvestorPlan: (planAmount: number) =>
    apiPatch<InvestorLimitSnapshot>('/users/me/investor-plan', { planAmount }),
  claimWithdrawal: (withdrawalId: string) =>
    apiPost<ClaimWithdrawalResult>(
      `/withdrawal-payments/withdrawal/${withdrawalId}/claim`,
    ),
  previewCredit: (amount: number, withdrawalId?: string) =>
    apiGet<CreditPreview>('/withdrawal-payments/credit-preview', {
      amount,
      withdrawalId,
    }),
  getWithdrawalDetail: (id: string) =>
    apiGet<AvailableWithdrawal & { payments: FulfillmentPayment[] }>(
      `/withdrawal-payments/withdrawal/${id}`,
    ),
  submitPayment: (withdrawalId: string, payload: SubmitPaymentPayload) =>
    apiPost<FulfillmentPayment>(`/withdrawal-payments/withdrawal/${withdrawalId}`, payload),
  getMyPayments: (query: FulfillListQuery = {}) =>
    apiGet<Paginated<FulfillmentPayment>>('/withdrawal-payments/mine', cleanFulfillQuery(query)),
  presignUpload: (filename: string, contentType: string) =>
    apiPost<PresignResponse>('/uploads/presign', {
      filename,
      contentType,
      purpose: 'withdrawal-payment-proof',
    }),
  /** Server-side proof upload (avoids browser→R2 CORS failures). */
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
