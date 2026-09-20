import { toPayerCreditPublic, toPayerPaymentPublic } from './payer-credit-public.util';

const base = {
  payAmount: 1000,
  payCurrency: 'INR',
  payAmountInr: 1000,
  principalCredit: 1000,
  bonusAmount: 50,
  bonusPercentage: 5,
  netCredited: 1050,
  creditCurrency: 'INR',
  exchangeRate: null as number | null,
  businessId: 'biz-1',
};

describe('toPayerCreditPublic', () => {
  it('keeps bonus on investor credit preview', () => {
    const pub = toPayerCreditPublic({ ...base, isInvestor: true });
    expect(pub.bonusAmount).toBe(50);
    expect(pub.netCredited).toBe(1050);
    expect(pub.isInvestor).toBe(true);
  });

  it('strips bonus for non-investors even if breakdown leaked a bonus', () => {
    const pub = toPayerCreditPublic({ ...base, isInvestor: false });
    expect(pub.bonusAmount).toBe(0);
    expect(pub.bonusPercentage).toBe(0);
    expect(pub.netCredited).toBe(1000);
    expect(pub.isInvestor).toBe(false);
  });
});

describe('toPayerPaymentPublic', () => {
  it('strips bonus fields when stripBonus is set', () => {
    const pub = toPayerPaymentPublic(
      {
        amount: 1000,
        bonusAmount: 40,
        estimatedBonusAmount: 40,
        commissionAmount: 10,
      },
      { stripBonus: true },
    );
    expect(pub.bonusAmount).toBe(0);
    expect(pub.estimatedBonusAmount).toBe(0);
    expect(pub.commissionAmount).toBeUndefined();
  });
});
