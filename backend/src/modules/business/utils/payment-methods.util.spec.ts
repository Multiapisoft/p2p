import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import {
  isMethodAllowed,
  resolveDepositMethods,
  resolveInvestorDepositMethods,
  resolveInvestorWithdrawalMethods,
  resolveWithdrawalMethods,
} from './payment-methods.util';

describe('payment-methods.util', () => {
  it('falls back to allowedPaymentMethods then all methods', () => {
    expect(resolveDepositMethods({})).toEqual(Object.values(PaymentMethod));
    expect(
      resolveDepositMethods({ allowedPaymentMethods: [PaymentMethod.UPI, PaymentMethod.BANK] }),
    ).toEqual([PaymentMethod.UPI, PaymentMethod.BANK]);
    expect(
      resolveDepositMethods({
        allowedDepositMethods: [PaymentMethod.USDT],
        allowedPaymentMethods: [PaymentMethod.UPI],
      }),
    ).toEqual([PaymentMethod.USDT]);
  });

  it('resolves withdrawal methods independently', () => {
    expect(
      resolveWithdrawalMethods({
        allowedWithdrawalMethods: [PaymentMethod.UPI],
        allowedPaymentMethods: [PaymentMethod.BANK, PaymentMethod.USDT],
      }),
    ).toEqual([PaymentMethod.UPI]);
  });

  it('checks method allow-list', () => {
    expect(isMethodAllowed([PaymentMethod.UPI], PaymentMethod.UPI)).toBe(true);
    expect(isMethodAllowed([PaymentMethod.UPI], PaymentMethod.BANK)).toBe(false);
  });

  it('investor methods default to all when empty', () => {
    expect(resolveInvestorWithdrawalMethods(null)).toEqual(['upi', 'bank', 'usdt', 'cdm']);
    expect(resolveInvestorWithdrawalMethods([])).toEqual(['upi', 'bank', 'usdt', 'cdm']);
    expect(resolveInvestorWithdrawalMethods(['upi', 'usdt'])).toEqual(['upi', 'usdt']);
    expect(resolveInvestorDepositMethods(null)).toEqual(['upi', 'bank', 'usdt', 'cdm']);
    expect(resolveInvestorDepositMethods(['bank'])).toEqual(['bank']);
  });
});
