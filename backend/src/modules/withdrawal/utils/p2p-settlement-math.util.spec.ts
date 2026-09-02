import {
  applyApproveCrossBizPay,
  applyApproveInvestorPay,
  applyApproveSameBizPay,
  applyListWithdrawal,
  applyUnlistWithdrawal,
  bizRemaining,
  computePayFees,
  percentFee,
  roundMoney,
  type BizQuotaState,
} from './p2p-settlement-math.util';
import { assignDefinedFields } from '../../business/utils/assign-defined.util';
import { shouldCreditInvestorBonus } from './payment-notification.util';

/**
 * Full Noida fee + limit + ledger scenario from product example:
 * Biz A limit 50k, WD 10%, deposit 5%, investor bonus 2%.
 * Biz B deposit 10%.
 */
describe('p2p-settlement-math (ledger + commissions + limits)', () => {
  const WD_FEE = 10;
  const DEP_FEE_A = 5;
  const DEP_FEE_B = 10;
  const INV_BONUS = 2;

  function freshA(): BizQuotaState {
    return { limit: 50_000, earned: 0, used: 0 };
  }

  function freshB(): BizQuotaState {
    return { limit: 0, earned: 0, used: 0 };
  }

  describe('percentFee / computePayFees', () => {
    it('computes WD + deposit fees for business payer', () => {
      const fees = computePayFees({
        payAmount: 5000,
        wdFeePercent: WD_FEE,
        depositFeePercent: DEP_FEE_A,
      });
      expect(fees.withdrawalFee).toBe(500);
      expect(fees.depositFee).toBe(250);
      expect(fees.investorBonus).toBe(0);
      expect(fees.adminFeeIn).toBe(750);
    });

    it('skips deposit fee for investor; applies bonus %', () => {
      const fees = computePayFees({
        payAmount: 10_000,
        wdFeePercent: WD_FEE,
        depositFeePercent: DEP_FEE_A,
        investorBonusPercent: INV_BONUS,
        isInvestor: true,
      });
      expect(fees.withdrawalFee).toBe(1000);
      expect(fees.depositFee).toBe(0);
      expect(fees.investorBonus).toBe(200);
      expect(fees.adminFeeIn).toBe(1000);
    });

    it('rounds like commission service (2dp)', () => {
      expect(percentFee(333, 10)).toBe(33.3);
      expect(roundMoney(10.005)).toBe(10.01);
    });
  });

  describe('list → same-biz pay → cross-biz pay → investor pay', () => {
    it('matches the full product walkthrough', () => {
      let A = freshA();
      let B = freshB();
      let adminBalance = 0;

      expect(bizRemaining(A)).toBe(50_000);

      // 1) User of A lists WD ₹20k
      A = applyListWithdrawal(A, 20_000);
      expect(bizRemaining(A)).toBe(30_000);
      expect(A.used).toBe(20_000);

      // 2) Same-biz pay ₹5k → earn +5k, fees 500+250 from A (list reserve stays)
      {
        const r = applyApproveSameBizPay({
          state: A,
          payAmount: 5000,
          wdFeePercent: WD_FEE,
          depositFeePercent: DEP_FEE_A,
        });
        A = r.wdOwner;
        adminBalance = roundMoney(adminBalance + r.adminWalletDelta);
        expect(r.fees.withdrawalFee).toBe(500);
        expect(r.fees.depositFee).toBe(250);
        // earned 5000; used: 20000 + 500 + 250 = 20750 → rem 50000+5000-20750 = 34250
        expect(A.earned).toBe(5000);
        expect(A.used).toBe(20_750);
        expect(bizRemaining(A)).toBe(34_250);
        expect(adminBalance).toBe(750);
      }

      // 3) Biz B user pays ₹5k on A's WD
      {
        const r = applyApproveCrossBizPay({
          wdOwner: A,
          payer: B,
          payAmount: 5000,
          wdFeePercent: WD_FEE,
          payerDepositFeePercent: DEP_FEE_B,
        });
        A = r.wdOwner;
        B = r.payer!;
        adminBalance = roundMoney(adminBalance + r.adminWalletDelta);
        expect(r.fees.withdrawalFee).toBe(500); // from A
        expect(r.fees.depositFee).toBe(500); // 10% of 5k from B
        // A used: 20750 - 5000 + 500 = 16250 → rem 50000+5000-16250 = 38750
        expect(A.used).toBe(16_250);
        expect(bizRemaining(A)).toBe(38_750);
        // B: earned 5000, used 500 → rem = 0+5000-500 = 4500
        expect(B.earned).toBe(5000);
        expect(B.used).toBe(500);
        expect(bizRemaining(B)).toBe(4500);
        expect(adminBalance).toBe(750 + 1000); // +500 WD +500 dep
      }

      // 4) Investor pays remaining ₹10k (no release — remaining must not jump)
      {
        const r = applyApproveInvestorPay({
          wdOwner: A,
          payAmount: 10_000,
          wdFeePercent: WD_FEE,
          investorBonusPercent: INV_BONUS,
        });
        A = r.wdOwner;
        adminBalance = roundMoney(adminBalance + r.adminWalletDelta);
        expect(r.fees.withdrawalFee).toBe(1000);
        expect(r.fees.depositFee).toBe(0);
        expect(r.fees.investorBonus).toBe(200);
        // A used: 16250 + 1000 = 17250 → rem 50000+5000-17250 = 37750
        expect(A.used).toBe(17_250);
        expect(bizRemaining(A)).toBe(37_750);
        // admin: +1000 fee − 200 bonus
        expect(r.adminWalletDelta).toBe(800);
        expect(adminBalance).toBe(1750 + 800);
      }

      // List reserve for unpaid is gone via cross release; investor kept its share consumed.
      // Fee used: 500+250+500+1000 = 2250; plus investor's unpaid list share 10000 → used 17250
      expect(A.used).toBe(17_250);
      expect(A.earned).toBe(5000);
    });

    it('unlist releases unpaid reserve without fee consume', () => {
      let A = applyListWithdrawal(freshA(), 20_000);
      A = applyUnlistWithdrawal(A, 20_000);
      expect(bizRemaining(A)).toBe(50_000);
      expect(A.used).toBe(0);
    });

    it('partial list unpaid release after one same-biz pay keeps fee used + earn', () => {
      let A = applyListWithdrawal(freshA(), 20_000);
      const paid = applyApproveSameBizPay({
        state: A,
        payAmount: 5000,
        wdFeePercent: WD_FEE,
        depositFeePercent: DEP_FEE_A,
      });
      A = paid.wdOwner;
      // unpaid open still reserved = 15000; unlist releases that
      A = applyUnlistWithdrawal(A, 15_000);
      // used after unlist: 20750 - 15000 = 5750 (paid list share 5k + fees 750)
      expect(A.used).toBe(5750);
      expect(A.earned).toBe(5000);
      // rem = 50000+5000-5750 = 49250
      expect(bizRemaining(A)).toBe(49_250);
    });
  });

  describe('admin ledger wallet deltas', () => {
    it('admin net = WD fee + deposit fee − investor bonus', () => {
      const same = applyApproveSameBizPay({
        state: freshA(),
        payAmount: 5000,
        wdFeePercent: 10,
        depositFeePercent: 5,
      });
      expect(same.adminWalletDelta).toBe(750);

      const inv = applyApproveInvestorPay({
        wdOwner: applyListWithdrawal(freshA(), 10_000),
        payAmount: 10_000,
        wdFeePercent: 10,
        investorBonusPercent: 2,
      });
      expect(inv.fees.adminFeeIn).toBe(1000);
      expect(inv.fees.investorBonus).toBe(200);
      expect(inv.adminWalletDelta).toBe(800);
    });
  });

  describe('investor bonus gate vs fee calc', () => {
    it('bonus amount computed; gate always allows credit', () => {
      const fees = computePayFees({
        payAmount: 5000,
        wdFeePercent: 10,
        depositFeePercent: 0,
        investorBonusPercent: 2,
        isInvestor: true,
      });
      expect(fees.investorBonus).toBe(100);
      expect(
        shouldCreditInvestorBonus({
          planAmount: 25_000,
          multiplier: 1.1,
          paidTowardPlan: 0,
          thisPaymentPrincipal: 5000,
        }),
      ).toBe(true);
    });
  });

  describe('assignDefinedFields (txn-flags Object.assign bug)', () => {
    it('does not wipe required fields with undefined DTO keys', () => {
      const business = { name: 'Testing_Business', depositsEnabled: true, slug: 'test' };
      assignDefinedFields(business, {
        name: undefined,
        depositsEnabled: false,
        allowPartialPay: true,
      });
      expect(business.name).toBe('Testing_Business');
      expect(business.depositsEnabled).toBe(false);
      expect((business as { allowPartialPay?: boolean }).allowPartialPay).toBe(true);
    });
  });
});
