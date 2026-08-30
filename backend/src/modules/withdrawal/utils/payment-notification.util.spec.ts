import {
  paymentReceivedNotification,
  shouldCreditInvestorBonus,
} from './payment-notification.util';

describe('payment-notification.util', () => {
  describe('paymentReceivedNotification', () => {
    it('partial copy when not fully covered', () => {
      const n = paymentReceivedNotification({
        payAmount: 1000,
        paidAmount: 500,
        reservedAmount: 0,
        withdrawalAmount: 5000,
        referenceId: 'WDR-1',
      });
      expect(n.title).toBe('Partial Payment Received');
    });

    it('full copy when covered', () => {
      const n = paymentReceivedNotification({
        payAmount: 5000,
        paidAmount: 5000,
        reservedAmount: 0,
        withdrawalAmount: 5000,
        referenceId: 'WDR-2',
      });
      expect(n.title).toBe('Full Payment Received');
    });
  });

  describe('shouldCreditInvestorBonus', () => {
    it('always true — bonus applies on every investor pay', () => {
      expect(
        shouldCreditInvestorBonus({
          planAmount: 25000,
          multiplier: 1.1,
          paidTowardPlan: 0,
          thisPaymentPrincipal: 5000,
        }),
      ).toBe(true);
      expect(
        shouldCreditInvestorBonus({
          planAmount: null,
          multiplier: 1.1,
          paidTowardPlan: 0,
          thisPaymentPrincipal: 1000,
        }),
      ).toBe(true);
    });
  });
});
