export type UserRole = 'admin' | 'sub_admin' | 'user' | 'business' | 'investor';
export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export type PaymentMethod = 'upi' | 'bank' | 'usdt';

export interface User {
  _id: string;
  userId?: string;
  businessId?: string;
  email: string;
  name: string;
  phone?: string;
  externalRef?: string;
  role: UserRole;
  status: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface IntegrationUrls {
  partnerSiteUrl?: string;
  returnUrl?: string;
  balancePageUrl?: string;
  creditPageUrl?: string;
  debitPageUrl?: string;
}

export interface IntegrationConfig {
  businessId: string;
  businessName: string;
  apiBaseUrl: string;
  userPanelUrl: string;
  webhookUrl: string | null;
  partnerSite: {
    baseUrl: string | null;
    returnUrl: string | null;
    balancePage: string | null;
    creditPage: string | null;
    debitPage: string | null;
  };
  integrationUrls: IntegrationUrls;
  endpoints: Record<string, string>;
  partnerApi?: {
    balanceUrl: string | null;
    creditUrl: string | null;
    debitUrl: string | null;
    apiKey: string | null;
    configured: boolean;
  };
  headers: {
    apiKey: string;
    apiSecret: string;
    internalSecret: string;
  };
  requiresInternalSecret: boolean;
  secureEndpoints: string[];
  flow: string[];
}

export interface BusinessProfile {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  apiKey: string;
  referralCode?: string;
  webhookUrl?: string;
  commissionRate: number;
  p2pPayLimit?: number;
  p2pPayUsed?: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalUsers: number;
  totalCommissionEarned: number;
  allowedPaymentMethods: PaymentMethod[];
  status: string;
  integrationUrls?: IntegrationUrls;
  createdAt: string;
  updatedAt?: string;
}

export interface BusinessStats {
  totalDeposits: number;
  totalWithdrawals: number;
  totalUsers: number;
  totalCommissionEarned: number;
  commissionRate: number;
  p2pPayLimit?: number;
  p2pPayUsed?: number;
  p2pPayRemaining?: number | null;
}

export interface CreateBusinessResponse {
  business: BusinessProfile;
  apiKey: string;
  apiSecret: string;
  internalSecret: string;
  referralCode: string;
}

export interface RegenerateKeysResponse {
  apiKey: string;
  apiSecret: string;
  internalSecret: string;
}

export interface Deposit {
  _id: string;
  referenceId: string;
  userId: string | { _id: string; name?: string; email?: string; phone?: string; externalRef?: string };
  businessId?: string;
  amount: number;
  currency: string;
  method: PaymentMethod | string;
  status: TransactionStatus;
  upiDetails?: { upiId?: string; payerName?: string; utr?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
    utr?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string; txHash?: string };
  commissionAmount?: number;
  externalRef?: string;
  completedAt?: string;
  failureReason?: string;
  createdAt: string;
}

export interface WithdrawalPaymentBrief {
  _id: string;
  referenceId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  utr?: string;
  proofImageUrl?: string;
  /** Business/platform commission cut for this payment. */
  commissionAmount?: number;
  bonusAmount?: number;
  netCreditedAmount?: number;
  estimatedCommissionAmount?: number;
  estimatedBonusAmount?: number;
  estimatedNetCredited?: number;
  rejectionReason?: string;
  createdAt?: string;
  completedAt?: string;
  notes?: string;
  disputedAt?: string;
}

export interface Withdrawal {
  _id: string;
  referenceId: string;
  userId: string | { _id: string; name?: string; email?: string; phone?: string; externalRef?: string };
  businessId?: string;
  amount: number;
  paidAmount?: number;
  reservedAmount?: number;
  remainingAmount?: number;
  currency: string;
  method: PaymentMethod | string;
  status: TransactionStatus;
  upiDetails?: { upiId?: string; payerName?: string; utr?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
    utr?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string; txHash?: string };
  commissionAmount?: number;
  paymentCount?: number;
  payments?: WithdrawalPaymentBrief[];
  failureReason?: string;
  completedAt?: string;
  createdAt: string;
}

export interface BusinessOverview {
  totalUsers: number;
  depositCount: number;
  completedDeposits: number;
  pendingDeposits: number;
  totalDepositAmount: number;
  withdrawalCount?: number;
  completedWithdrawals?: number;
  pendingWithdrawals?: number;
  totalWithdrawals: number;
  totalCommissionEarned: number;
  commissionRate: number;
  businessName?: string;
  businessStatus?: string;
}

export interface DepositSummaryRow {
  userId: string;
  userName: string;
  userEmail: string;
  totalDeposited: number;
  depositCount: number;
}

export interface LedgerEntry {
  _id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  description?: string;
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  ticketId: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category?: string;
  replies?: { authorId: string; message: string; createdAt: string }[];
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
