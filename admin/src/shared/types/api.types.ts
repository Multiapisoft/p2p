export type UserRole = 'admin' | 'sub_admin' | 'user' | 'business' | 'investor';
export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface ReferredBusiness {
  _id: string;
  name: string;
  referralCode?: string;
}

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
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: string;
  permissions?: string[];
  referredByBusiness?: string;
  referredBusiness?: ReferredBusiness;
  businessUserCode?: string;
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
}

export interface DashboardStats {
  users: { total: number };
  businesses: { total: number };
  investors: { total: number };
  deposits: { pending: number; totalCompleted: number };
  withdrawals: { pending: number; totalCompleted: number };
}

export interface Deposit {
  _id: string;
  referenceId: string;
  userId: string | UserSummary;
  businessId?: string | { _id: string; name?: string; slug?: string; status?: string; referralCode?: string };
  amount: number;
  currency: string;
  method: string;
  status: TransactionStatus;
  commissionAmount?: number;
  commissionPaidTo?: string | UserSummary;
  utr?: string;
  upiDetails?: { upiId?: string; payerName?: string; utr?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
    utr?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string; txHash?: string };
  cdmDetails?: { payerName?: string; locationHint?: string; notes?: string };
  failureReason?: string;
  completedAt?: string;
  createdAt: string;
}

export interface UserSummary {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  businessUserCode?: string;
  externalRef?: string;
}

export interface WithdrawalPaymentBrief {
  _id: string;
  referenceId?: string;
  amount: number;
  currency?: string;
  status: string;
  utr?: string;
  proofImageUrl?: string;
  commissionAmount?: number;
  bonusAmount?: number;
  netCreditedAmount?: number;
  payerUserId?: string | UserSummary;
  createdAt?: string;
}

export interface Withdrawal {
  _id: string;
  referenceId: string;
  userId: string | UserSummary;
  amount: number;
  currency: string;
  method: string;
  status: TransactionStatus;
  businessId?: string | { _id: string; name?: string; referralCode?: string };
  paidAmount?: number;
  remainingAmount?: number;
  paymentCount?: number;
  payments?: WithdrawalPaymentBrief[];
  commissionAmount?: number;
  p2pListStatus?: 'awaiting' | 'listed' | 'rejected';
  origin?: 'user' | 'investor' | 'business';
  p2pListedAt?: string;
  p2pListedBy?: string;
  p2pListRejectReason?: string;
  assignedTo?: string | UserSummary;
  assignedBy?: string;
  assignedAt?: string;
  priority?: boolean;
  priorityAt?: string;
  createdAt: string;
  upiDetails?: { upiId?: string; payerName?: string; utr?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
    utr?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string; txHash?: string };
}

export interface Business {
  _id: string;
  name: string;
  slug: string;
  status: string;
  totalDeposits: number;
  totalUsers: number;
  commissionRate: number;
  p2pPayLimit?: number;
  p2pPayEarned?: number;
  p2pPayUsed?: number;
  p2pPayCap?: number;
  p2pPayRemaining?: number | null;
  highlightLimitPerMonth?: number;
  highlightUsedThisMonth?: number;
  highlightRemainingThisMonth?: number;
  highlightMonthKey?: string;
  totalCommissionEarned?: number;
  depositsEnabled?: boolean;
  withdrawalsEnabled?: boolean;
  b2bMatchingEnabled?: boolean;
  createdAt: string;
}

export interface Commission {
  _id: string;
  targetType: string;
  targetId?: string;
  paymentMethod?: string;
  feeMode?: 'percentage' | 'fixed' | 'both';
  percentage: number;
  fixedFee: number;
  minAmount?: number;
  maxAmount?: number;
  appliesTo?: 'all' | 'deposit' | 'withdrawal';
  isActive: boolean;
  description?: string;
}

export type CommissionFeeMode = 'percentage' | 'fixed' | 'both';

export interface CommissionRuleInput {
  feeMode: CommissionFeeMode;
  percentage: number;
  fixedFee: number;
  useRange?: boolean;
  minAmount?: number;
  maxAmount?: number;
  description?: string;
  isActive?: boolean;
}

export interface PaymentConfig {
  _id: string;
  method: string;
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
  userId?: string | UserSummary;
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
  userId: string | { _id: string; name?: string; email?: string; role?: string };
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
  counterpartyUserId?: string | { _id: string; name?: string; email?: string; role?: string };
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

export interface BusinessStats {
  totalDeposits: number;
  totalWithdrawals: number;
  totalUsers: number;
  totalCommissionEarned: number;
  commissionRate: number;
  p2pPayLimit?: number;
  p2pPayEarned?: number;
  p2pPayUsed?: number;
  p2pPayCap?: number;
  p2pPayRemaining?: number | null;
  highlightLimitPerMonth?: number;
  highlightUsedThisMonth?: number;
  highlightRemainingThisMonth?: number;
  highlightMonthKey?: string;
}

export interface AuditLog {
  _id: string;
  actorEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  createdAt: string;
}

export interface Redemption {
  _id: string;
  referenceId: string;
  investorId:
    | string
    | {
        _id: string;
        name?: string;
        email?: string;
        phone?: string;
      };
  amount: number;
  method?: string;
  upiDetails?: { upiId?: string; payerName?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string };
  note?: string;
  status: TransactionStatus;
  failureReason?: string;
  createdAt: string;
}

export interface Investment {
  _id: string;
  referenceId: string;
  investorId:
    | string
    | {
        _id: string;
        name?: string;
        email?: string;
        phone?: string;
      };
  amount: number;
  method: string;
  note?: string;
  status: TransactionStatus;
  failureReason?: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
