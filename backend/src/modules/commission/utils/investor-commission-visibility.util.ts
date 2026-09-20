import { UserRole } from '../../../common/enums/role.enum';

/** Strict role check — business users never count as investors for bonus. */
export function isInvestorPayerRole(role?: string | null): boolean {
  return (role || '').toLowerCase() === UserRole.INVESTOR;
}

/**
 * Investor bonus (INVESTOR_BONUS) is visible only to investors.
 * Business/user payers must not see or receive this extra credit.
 */
export function visibleInvestorBonusAmount(opts: {
  viewerRole?: string | null;
  /** @deprecated Ignored — visibility follows payer role only. */
  showToInvestor?: boolean;
  bonusAmount: number;
}): number {
  if (!isInvestorPayerRole(opts.viewerRole)) return 0;
  return Math.max(0, Number(opts.bonusAmount) || 0);
}
