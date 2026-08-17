import {
  paymentReceivedNotification,
  shouldCreditInvestorBonus,
} from './payment-notification.util';

describe('payment-notification.util (#12 #26)', () => {
  describe('paymentReceivedNotification', () => {
    it('says Partial when reserved+paid < amount', () => {
      const n = paymentReceivedNotification({
        payAmount: 500,
        paidAmount: 0,
        reservedAmount: 500,
        withdrawalAmount: 1000,
        referenceId: 'WDR-1',
      });
      expect(n.title).toBe('Partial Payment Received');
      expect(n.body).toContain('₹500');
      expect(n.body).toContain('WDR-1');
    });

    it('says Full when reserved+paid covers full amount', () => {
      const n = paymentReceivedNotification({
        payAmount: 1000,
        paidAmount: 0,
        reservedAmount: 1000,
        withdrawalAmount: 1000,
        referenceId: 'WDR-FULL',
      });
      expect(n.title).toBe('Full Payment Received');
      expect(n.body).toMatch(/Full payment/);
      expect(n.body).toContain('WDR-FULL');
    });

    it('says Full when partials already cover remaining', () => {
      const n = paymentReceivedNotification({
        payAmount: 400,
        paidAmount: 600,
        reservedAmount: 400,
        withdrawalAmount: 1000,
        referenceId: 'WDR-2',
      });
      expect(n.title).toBe('Full Payment Received');
    });
  });

  describe('shouldCreditInvestorBonus', () => {
    it('false before target', () => {
      expect(
        shouldCreditInvestorBonus({
          planAmount: 25000,
          multiplier: 1.1,
          paidTowardPlan: 10000,
          thisPaymentPrincipal: 5000,
        }),
      ).toBe(false);
    });

    it('true when this payment crosses 110% target', () => {
      // target = 27500
      expect(
        shouldCreditInvestorBonus({
          planAmount: 25000,
          multiplier: 1.1,
          paidTowardPlan: 27000,
          thisPaymentPrincipal: 500,
        }),
      ).toBe(true);
    });

    it('false when no plan selected', () => {
      expect(
        shouldCreditInvestorBonus({
          planAmount: null,
          multiplier: 1.1,
          paidTowardPlan: 99999,
          thisPaymentPrincipal: 1000,
        }),
      ).toBe(false);
    });
  });
});
