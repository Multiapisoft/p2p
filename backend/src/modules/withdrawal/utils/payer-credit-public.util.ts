/** Payer-facing credit fields: never expose platform/business fee cuts. */
export type PayerCreditPublic = {
  payAmount: number;
  payCurrency: string;
  payAmountInr: number;
  principalCredit: number;
  bonusAmount: number;
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
  return {
    payAmount: breakdown.payAmount,
    payCurrency: breakdown.payCurrency,
    payAmountInr: breakdown.payAmountInr,
    principalCredit: breakdown.principalCredit,
    bonusAmount: breakdown.bonusAmount,
    netCredited: breakdown.netCredited,
    creditCurrency: breakdown.creditCurrency,
    exchangeRate: breakdown.exchangeRate,
    isInvestor: breakdown.isInvestor,
    businessId: breakdown.businessId,
  };
}

/** Strip fee-cut fields from payment docs returned to payers (user/investor). */
export function toPayerPaymentPublic<T extends Record<string, unknown>>(payment: T): T {
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
  return rest as T;
}
