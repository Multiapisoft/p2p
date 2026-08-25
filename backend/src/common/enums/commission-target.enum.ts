export enum CommissionTarget {
  BUSINESS = 'business',
  INVESTOR = 'investor',
  PLATFORM = 'platform',
  /** Extra %/fixed credited to investor when they pay via a business P2P flow */
  INVESTOR_BONUS = 'investor_bonus',
}

export enum CommissionFeeMode {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  BOTH = 'both',
}

/** Which txn kind a business/platform fee rule applies to. */
export enum CommissionAppliesTo {
  ALL = 'all',
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}
