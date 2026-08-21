export enum Currency {
  INR = 'INR',
  USDT = 'USDT',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum LedgerType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  COMMISSION = 'commission',
  INVESTMENT = 'investment',
  REDEMPTION = 'redemption',
  ADJUSTMENT = 'adjustment',
  LOCK = 'lock',
  UNLOCK = 'unlock',
  P2P_LIMIT = 'p2p_limit',
}

export enum LedgerDirection {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum LedgerFlow {
  PLATFORM_FEE = 'platform_fee',
  INVESTOR_COMMISSION = 'investor_commission',
}
