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
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  status: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  permissions?: string[];
}

export interface Portfolio {
  totalDeposited: number;
  totalInvested: number;
  totalRedeemed: number;
  redeemableAmount: number;
  balance: number;
  lockedBalance: number;
  pendingInvestmentLocked?: number;
}

export interface WalletBalance {
  availableBalance: number;
  redeemableAmount: number;
}

export interface Investment {
  _id: string;
  referenceId: string;
  investorId: string;
  amount: number;
  method: PaymentMethod;
  status: TransactionStatus;
  note?: string;
  failureReason?: string;
  createdAt: string;
}

export interface Redemption {
  _id: string;
  referenceId: string;
  investorId: string;
  amount: number;
  method?: PaymentMethod;
  upiDetails?: DepositUpiDetails;
  bankDetails?: DepositBankDetails;
  usdtDetails?: DepositUsdtDetails;
  status: TransactionStatus;
  note?: string;
  failureReason?: string;
  createdAt: string;
}

export interface Withdrawal {
  _id: string;
  referenceId: string;
  userId: string;
  amount: number;
  paidAmount?: number;
  reservedAmount?: number;
  remainingAmount?: number;
  currency: string;
  method: PaymentMethod;
  status: TransactionStatus;
  upiDetails?: DepositUpiDetails;
  bankDetails?: DepositBankDetails;
  usdtDetails?: DepositUsdtDetails;
  sourceAmount?: number;
  sourceCurrency?: string;
  exchangeRate?: number;
  createdAt: string;
}

export interface CreateWithdrawalPayload {
  amount: number;
  method: PaymentMethod;
  upiDetails?: { upiId: string; payerName?: string };
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress: string; network?: string };
}

export interface CreateRedemptionPayload {
  amount: number;
  method: PaymentMethod;
  note?: string;
  upiDetails?: { upiId: string; payerName?: string };
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress: string; network?: string };
}

export interface DepositUpiDetails {
  upiId: string;
  payerName?: string;
  utr?: string;
}

export interface DepositBankDetails {
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
  bankName?: string;
  utr?: string;
}

export interface DepositUsdtDetails {
  walletAddress: string;
  network?: string;
  txHash?: string;
}

export interface Deposit {
  _id: string;
  referenceId: string;
  userId: string;
  businessId?: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: TransactionStatus;
  upiDetails?: DepositUpiDetails;
  bankDetails?: DepositBankDetails;
  usdtDetails?: DepositUsdtDetails;
  createdAt: string;
}

export interface DepositMethodSummary {
  byMethod: Record<string, { totalAmount: number; count: number }>;
  totalAmount: number;
  totalCount: number;
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

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
