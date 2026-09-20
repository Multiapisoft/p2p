/** Payer-facing credit fields: never expose platform/business fee cuts. */
export type PayerCreditPublic = {
  payAmount: number;
  payCurrency: string;
  payAmountInr: number;
  principalCredit: number;
  bonusAmount: number;
  /** Business INVESTOR_BONUS percentage applied (0 if none). */
  bonusPercentage?: number;
  netCredited: number;
  creditCurrency: string;
  exchangeRate: number | null;
  isInvestor: boolean;
  businessId: string | null;
};

export function toPayerCreditPublic(breakdown: {
  payAmount: number;
  payCurrency: string;
  payAmountInr: number;
  principalCredit: number;
  bonusAmount: number;
  bonusPercentage?: number;
  netCredited: number;
  creditCurrency: string;
  exchangeRate: number | null;
  isInvestor: boolean;
  businessId: string | null;
  /** Internal: do not leak */
  commissionAmount?: number;
  businessCommission?: number;
  platformCommission?: number;
  bonusInPayCurrency?: number;
}): PayerCreditPublic {
  const isInvestor = !!breakdown.isInvestor;
  const bonusAmount = isInvestor
    ? Math.max(0, Number(breakdown.bonusAmount) || 0)
    : 0;
  const principalCredit = Math.max(0, Number(breakdown.principalCredit) || 0);
  return {
    payAmount: breakdown.payAmount,
    payCurrency: breakdown.payCurrency,
    payAmountInr: breakdown.payAmountInr,
    principalCredit,
    bonusAmount,
    bonusPercentage: isInvestor ? breakdown.bonusPercentage ?? 0 : 0,
    netCredited: isInvestor
      ? Math.max(0, Number(breakdown.netCredited) || 0)
      : principalCredit,
    creditCurrency: breakdown.creditCurrency,
    exchangeRate: breakdown.exchangeRate,
    isInvestor,
    businessId: breakdown.businessId,
  };
}

/** Strip fee-cut fields from payment docs returned to payers (user/investor). */
export function toPayerPaymentPublic<T extends Record<string, unknown>>(
  payment: T,
  opts?: { stripBonus?: boolean },
): T {
  const {
    commissionAmount: _c,
    estimatedCommissionAmount: _ec,
    businessCommission: _bc,
    platformCommission: _pc,
    ...rest
  } = payment as T & {
    commissionAmount?: unknown;
    estimatedCommissionAmount?: unknown;
    businessCommission?: unknown;
    platformCommission?: unknown;
  };
  if (!opts?.stripBonus) return rest as T;
  return {
    ...rest,
    bonusAmount: 0,
    estimatedBonusAmount: 0,
  } as unknown as T;
}
