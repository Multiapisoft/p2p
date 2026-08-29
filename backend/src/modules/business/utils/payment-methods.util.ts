import { PaymentMethod } from '../../../common/enums/payment-method.enum';

const ALL_METHODS = Object.values(PaymentMethod);

export function resolveDepositMethods(business: {
  allowedDepositMethods?: PaymentMethod[] | string[] | null;
  allowedPaymentMethods?: PaymentMethod[] | string[] | null;
}): PaymentMethod[] {
  if (business.allowedDepositMethods?.length) {
    return [...business.allowedDepositMethods] as PaymentMethod[];
  }
  if (business.allowedPaymentMethods?.length) {
    return [...business.allowedPaymentMethods] as PaymentMethod[];
  }
  return [...ALL_METHODS];
}

export function resolveWithdrawalMethods(business: {
  allowedWithdrawalMethods?: PaymentMethod[] | string[] | null;
  allowedPaymentMethods?: PaymentMethod[] | string[] | null;
}): PaymentMethod[] {
  if (business.allowedWithdrawalMethods?.length) {
    return [...business.allowedWithdrawalMethods] as PaymentMethod[];
  }
  if (business.allowedPaymentMethods?.length) {
    return [...business.allowedPaymentMethods] as PaymentMethod[];
  }
  return [...ALL_METHODS];
}

export function isMethodAllowed(
  allowed: PaymentMethod[] | string[],
  method: PaymentMethod | string,
): boolean {
  return allowed.includes(method as PaymentMethod);
}

export function resolveInvestorWithdrawalMethods(
  methods?: string[] | null,
): string[] {
  if (Array.isArray(methods) && methods.length > 0) return [...methods];
  return ['upi', 'bank', 'usdt', 'cdm'];
}
