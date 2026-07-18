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
}
