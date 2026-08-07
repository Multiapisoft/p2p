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
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  permissions?: string[];
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
  userId: string;
  businessId?: string;
  amount: number;
  currency: string;
  method: string;
  status: TransactionStatus;
  commissionAmount?: number;
  createdAt: string;
}

export interface Withdrawal {
  _id: string;
  referenceId: string;
  userId: string;
  amount: number;
  currency: string;
  method: string;
  status: TransactionStatus;
  paidAmount?: number;
  commissionAmount?: number;
  p2pListStatus?: 'awaiting' | 'listed' | 'rejected';
  p2pListedAt?: string;
  p2pListedBy?: string;
  p2pListRejectReason?: string;
  createdAt: string;
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
  p2pPayUsed?: number;
  totalCommissionEarned?: number;
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
  userId?: string;
  replies?: { authorId: string; message: string; createdAt: string }[];
  createdAt: string;
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
  p2pPayUsed?: number;
  p2pPayRemaining?: number | null;
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
