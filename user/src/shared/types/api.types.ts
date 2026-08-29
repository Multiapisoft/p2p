export type UserRole = 'admin' | 'sub_admin' | 'user' | 'business' | 'investor';
export type PaymentMethod = 'upi' | 'bank' | 'usdt' | 'cdm';
export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface User {
  _id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: string;
  referredByBusiness?: string;
  referredBusiness?: {
    _id: string;
    name: string;
    referralCode?: string;
    allowedDepositMethods?: PaymentMethod[];
    allowedWithdrawalMethods?: PaymentMethod[];
  };
  businessUserCode?: string;
  savedWithdrawalMethods?: SavedWithdrawalMethod[];
  createdAt: string;
}

export interface SavedWithdrawalMethod {
  _id: string;
  label: string;
  method: PaymentMethod;
  isDefault?: boolean;
  upiDetails?: { upiId: string; payerName: string };
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName: string;
  };
  usdtDetails?: { walletAddress: string; network?: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  permissions?: string[];
  mustSetPassword?: boolean;
  twoFactorEnabled?: boolean;
  staffBusinessId?: string | null;
  isBusinessOwner?: boolean;
}

export interface Wallet {
  _id: string;
  userId: string;
  currency: string;
  balance: number;
  lockedBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
}

export interface WalletBalance {
  availableBalance: number;
  redeemableAmount: number;
  source?: 'partner' | 'finguard';
  currency?: string;
  lockedBalance?: number;
  balance?: number;
  /** INR per 1 USDT (config) */
  usdtInrRate?: number;
  /** Approx INR you can withdraw via UPI/Bank when wallet is USDT */
  approxInrAvailable?: number;
  /** Business pay-limit remaining (INR). Linked users cannot withdraw above this. */
  p2pPayRemainingInr?: number;
}

export interface Deposit {
  _id: string;
  referenceId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: TransactionStatus;
  upiDetails?: { upiId?: string; payerName?: string; utr?: string };
  bankDetails?: { accountNumber?: string; ifscCode?: string; accountHolderName?: string; utr?: string };
  usdtDetails?: { walletAddress?: string; network?: string; txHash?: string };
  createdAt: string;
}

export interface Withdrawal {
  _id: string;
  referenceId: string;
  userId: string;
  amount: number;
  paidAmount?: number;
  remainingAmount?: number;
  currency: string;
  method: PaymentMethod;
  status: TransactionStatus;
  upiDetails?: { upiId?: string; payerName?: string };
  bankDetails?: { accountNumber?: string; ifscCode?: string; accountHolderName?: string; bankName?: string };
  usdtDetails?: { walletAddress?: string; network?: string };
  /** USDT debited when payout is INR (UPI/Bank) */
  sourceAmount?: number;
  sourceCurrency?: string;
  /** INR per 1 USDT at request time */
  exchangeRate?: number;
  p2pListStatus?: 'awaiting' | 'listed' | 'rejected';
  p2pListedAt?: string;
  /** True while within cancel TAT and not yet listed for Platform Payment. */
  userCanCancel?: boolean;
  userCanEdit?: boolean;
  userEditExpiresAt?: string;
  tatSecondsRemaining?: number;
  payments?: WithdrawalSplitPayment[];
  createdAt: string;
}

export interface WithdrawalSplitPayment {
  _id: string;
  referenceId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  utr?: string;
  proofImageUrl?: string;
  netCreditedAmount?: number;
  rejectionReason?: string;
  createdAt?: string;
  completedAt?: string;
  autoApproveAt?: string;
  notes?: string;
  disputedAt?: string;
  disputeTicketId?: string;
}

export interface PaymentConfig {
  _id: string;
  method: PaymentMethod;
  currency: string;
  label: string;
  isActive: boolean;
  minAmount: number;
  maxAmount: number;
  details: Record<string, string>;
}

export interface SupportTicket {
  _id: string;
  ticketId: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category?: string;
  attachments?: TicketAttachment[];
  replies?: {
    authorId: string;
    message: string;
    createdAt: string;
    attachments?: TicketAttachment[];
  }[];
  createdAt: string;
}

export interface TicketAttachment {
  key: string;
  publicUrl: string;
  filename: string;
  contentType?: string;
  size?: number;
}

export interface LedgerEntry {
  _id: string;
  userId: string;
  type: string;
  direction?: string;
  flow?: string;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  description?: string;
  fromParty?: string;
  toParty?: string;
  createdAt: string;
}

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateDepositPayload {
  amount: number;
  method: PaymentMethod;
  currency?: string;
  integrationToken?: string;
  externalRef?: string;
  upiDetails?: { upiId: string; payerName?: string; utr?: string };
  bankDetails?: { accountNumber: string; ifscCode: string; accountHolderName: string; bankName?: string; utr?: string };
  usdtDetails?: { walletAddress: string; network?: string; txHash?: string };
  cdmDetails?: { payerName: string; locationHint?: string; notes?: string };
}

export interface CreateWithdrawalPayload {
  amount: number;
  method: PaymentMethod;
  integrationToken?: string;
  upiDetails?: { upiId: string; payerName: string; qrImageKey?: string; qrImageUrl?: string };
  bankDetails?: { accountNumber: string; ifscCode: string; accountHolderName: string; bankName: string };
  usdtDetails?: { walletAddress: string; network?: string };
  cdmDetails?: { payerName: string; locationHint?: string; notes?: string };
}
