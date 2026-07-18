export interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  internalSecret: string;
  baseUrl: string;
}

export interface VerifyResponse {
  verified: boolean;
  businessId: string;
  name: string;
  allowedPaymentMethods: string[];
  referralCode?: string;
}

export interface IntegrationUser {
  _id: string;
  userId: string;
  businessId: string;
  email: string;
  name: string;
  phone?: string;
  externalRef?: string;
  status: string;
  createdAt: string;
}

export interface UserLookupResponse {
  user: IntegrationUser;
  partnerBalance: {
    source: 'partner';
    email: string;
    currency: string;
    balance: number;
    lockedBalance: number;
    availableBalance: number;
  } | null;
  balance: {
    availableBalance: number;
    balance: number;
    lockedBalance: number;
    currency?: string;
  };
  finguardBalance?: {
    userId: string;
    availableBalance: number;
    balance: number;
    lockedBalance: number;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Deposit {
  _id: string;
  referenceId: string;
  userId: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  externalRef?: string;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  receivedAt: string;
  event: string;
  payload: unknown;
}

export interface FlowLog {
  id: string;
  time: string;
  step: string;
  status: 'success' | 'error' | 'info';
  message: string;
  data?: unknown;
}
