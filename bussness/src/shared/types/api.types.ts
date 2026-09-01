export type UserRole = 'admin' | 'sub_admin' | 'user' | 'business' | 'investor';
export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export type PaymentMethod = 'upi' | 'bank' | 'usdt' | 'cdm';

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

export interface User {
  _id: string;
  userId?: string;
  businessId?: string;
  email: string;
  name: string;
  phone?: string;
  externalRef?: string;
  businessUserCode?: string;
  role: UserRole;
  status: string;
  permissions?: string[];
  staffBusinessId?: string;
  savedWithdrawalMethods?: SavedWithdrawalMethod[];
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  permissions?: string[];
  twoFactorEnabled?: boolean;
  staffBusinessId?: string | null;
  isBusinessOwner?: boolean;
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
  p2pPayEarned?: number;
  p2pPayUsed?: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalUsers: number;
  totalCommissionEarned: number;
  allowedPaymentMethods: PaymentMethod[];
  allowedDepositMethods?: PaymentMethod[];
  allowedWithdrawalMethods?: PaymentMethod[];
  /** Minimum INR split pay on your withdrawals. 0 = platform default (₹5,000). */
  minPartialPayInr?: number;
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
  p2pPayEarned?: number;
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
  userId: string | {
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    externalRef?: string;
    businessUserCode?: string;
  };
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
  disputeTicketId?: string;
  autoApproveAt?: string;
}

export interface Withdrawal {
  _id: string;
  referenceId: string;
  userId: string | {
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    externalRef?: string;
    businessUserCode?: string;
  };
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
  p2pListStatus?: 'awaiting' | 'listed' | 'rejected';
  origin?: 'user' | 'investor' | 'business';
  p2pListedAt?: string;
  p2pListedBy?: string;
  p2pListRejectReason?: string;
  assignedTo?: string | {
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    businessUserCode?: string;
  };
  assignedBy?: string;
  assignedAt?: string;
  priority?: boolean;
  priorityAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface BusinessOverview {
  totalUsers: number;
  activeUsers?: number;
  depositCount: number;
  completedDeposits: number;
  pendingDeposits: number;
  failedDeposits?: number;
  cancelledDeposits?: number;
  rejectedDeposits?: number;
  totalDepositAmount: number;
  pendingDepositAmount?: number;
  depositStatusCounts?: Record<string, number>;
  withdrawalCount?: number;
  completedWithdrawals?: number;
  pendingWithdrawals?: number;
  pendingWithdrawalsAll?: number;
  failedWithdrawals?: number;
  cancelledWithdrawals?: number;
  rejectedWithdrawals?: number;
  totalWithdrawals: number;
  pendingWithdrawalAmount?: number;
  withdrawalStatusCounts?: Record<string, number>;
  awaitingListCount?: number;
  listedCount?: number;
  platformPaymentCount?: number;
  pendingPlatformPayments?: number;
  completedPlatformPayments?: number;
  platformPaymentStatusCounts?: Record<string, number>;
  inboundPlatformPayments?: number;
  inboundPlatformPaymentAmount?: number;
  outboundPlatformPayments?: number;
  outboundPlatformPaymentAmount?: number;
  totalCommissionEarned: number;
  commissionRate: number;
  p2pPayLimit?: number;
  p2pPayEarned?: number;
  p2pPayUsed?: number;
  p2pPayRemaining?: number | null;
  highlightLimitPerMonth?: number;
  highlightUsedThisMonth?: number;
  highlightRemainingThisMonth?: number;
  highlightMonthKey?: string;
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

export interface SupportTicket {
  _id: string;
  ticketId: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category?: string;
  userId?:
    | string
    | {
        _id: string;
        name?: string;
        email?: string;
        phone?: string;
        businessUserCode?: string;
      };
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
