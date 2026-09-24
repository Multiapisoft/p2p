import {
  applyApproveCrossBizPay,
  applyApproveInvestorPay,
  applyListWithdrawal,
  applyUnlistWithdrawal,
  bizRemaining,
  roundMoney,
  type BizQuotaState,
} from './p2p-settlement-math.util';
import {
  listApprovalHeadroomNeeded,
  overLimitListDecision,
} from './list-approval-fee-headroom.util';
import {
  remainingForPayingListedWithdrawal,
  p2pPayQuotaRemaining,
  isListedQuotaHoldActive,
  shouldHealCancelledListedQuota,
  withdrawalOwnerBusinessIdForRates,
} from '../../business/utils/p2p-pay-quota.util';
import {
  shouldSkipInProcessQuotaLedger,
  isInProcessP2pQuotaLedgerRef,
} from '../../business/utils/p2p-pay-quota-ledger.util';
import {
  isInvestorPayerRole,
  visibleInvestorBonusAmount,
} from '../../commission/utils/investor-commission-visibility.util';
import { toPayerCreditPublic } from './payer-credit-public.util';
import {
  investorCanSeePayItem,
  investorQueueShownMaxPayable,
} from './investor-pay-queue.util';

/**
 * Complex product walkthrough covering every fix from this conversation:
 * 1) Investor-only commission on P2P pay
 * 2) Pay after list must add back this WD's reserve (no false limit error)
 * 3) Investor queue must not show unpayable WDs / fake maxPayable
 * 4) Cancel/unlist restores remaining
 * 5) Ledger only on completed (skip list_reserve / list_release)
 * 6) Over-limit listing waits for admin
 */
describe('conversation fixes — complex end-to-end cases', () => {
  const WD_FEE = 10;
  const DEP_B = 10;
  const INV_BONUS = 2;

  function biz(limit: number, earned = 0, used = 0): BizQuotaState {
    return { limit, earned, used };
  }

  describe('1) Commission only for investors (B2 user pays B1 WD)', () => {
    it('Business 2 user gets principal only; investor on same WD gets bonus', () => {
      let A = applyListWithdrawal(biz(50_000), 20_000);
      const B = biz(0);

      const userPay = applyApproveCrossBizPay({
        wdOwner: A,
        payer: B,
        payAmount: 8_000,
        wdFeePercent: WD_FEE,
        payerDepositFeePercent: DEP_B,
      });
      expect(userPay.fees.investorBonus).toBe(0);
      expect(userPay.fees.depositFee).toBe(800);
      expect(userPay.fees.withdrawalFee).toBe(800);
      // User-facing preview must strip leaked bonus
      const userPreview = toPayerCreditPublic({
        payAmount: 8000,
        payCurrency: 'INR',
        payAmountInr: 8000,
        principalCredit: 8000,
        bonusAmount: 160, // leaked INVESTOR_BONUS %
        bonusPercentage: 2,
        netCredited: 8160,
        creditCurrency: 'INR',
        exchangeRate: null,
        isInvestor: false,
        businessId: 'biz-1',
      });
      expect(isInvestorPayerRole('user')).toBe(false);
      expect(visibleInvestorBonusAmount({ viewerRole: 'user', bonusAmount: 160 })).toBe(0);
      expect(userPreview.bonusAmount).toBe(0);
      expect(userPreview.netCredited).toBe(8000);

      A = userPay.wdOwner;
      const invPay = applyApproveInvestorPay({
        wdOwner: A,
        payAmount: 12_000,
        wdFeePercent: WD_FEE,
        investorBonusPercent: INV_BONUS,
      });
      expect(invPay.fees.investorBonus).toBe(240);
      expect(invPay.fees.depositFee).toBe(0);
      const invPreview = toPayerCreditPublic({
        payAmount: 12000,
        payCurrency: 'INR',
        payAmountInr: 12000,
        principalCredit: 12000,
        bonusAmount: 240,
        bonusPercentage: 2,
        netCredited: 12240,
        creditCurrency: 'INR',
        exchangeRate: null,
        isInvestor: true,
        businessId: 'biz-1',
      });
      expect(invPreview.bonusAmount).toBe(240);
      expect(invPreview.netCredited).toBe(12240);

      // Rates / bonus never follow B2 payer business
      expect(withdrawalOwnerBusinessIdForRates('biz-1')).toBe('biz-1');
      expect(withdrawalOwnerBusinessIdForRates(null)).toBeUndefined();
      expect(withdrawalOwnerBusinessIdForRates('')).toBeUndefined();
    });
  });

  describe('2) List-then-pay timing (false limit error)', () => {
    it('after listing ₹10k, remaining looks tiny but THIS WD can still be paid in full', () => {
      const before = biz(10_500);
      expect(bizRemaining(before)).toBe(10_500);

      const listed = applyListWithdrawal(before, 10_000);
      expect(bizRemaining(listed)).toBe(500);

      // Old bug: min(open, remainingAfterList) = min(10000, 500) = 500 → pay blocked
      const oldMaxPayable = Math.min(10_000, bizRemaining(listed));
      expect(oldMaxPayable).toBe(500);

      const effective = remainingForPayingListedWithdrawal(
        bizRemaining(listed),
        10_000,
      );
      expect(effective).toBe(10_500);
      const newMaxPayable = Math.min(10_000, effective);
      expect(newMaxPayable).toBe(10_000);

      expect(
        isListedQuotaHoldActive({ origin: 'user', p2pListStatus: 'listed' }),
      ).toBe(true);
      expect(
        isListedQuotaHoldActive({ origin: 'business', p2pListStatus: 'listed' }),
      ).toBe(false);
      expect(
        isListedQuotaHoldActive({ origin: 'user', p2pListStatus: 'over_limit' }),
      ).toBe(false);

      // Cross-biz user of B2 can pay the full listed open
      const pay = applyApproveCrossBizPay({
        wdOwner: listed,
        payer: biz(0),
        payAmount: 10_000,
        wdFeePercent: WD_FEE,
        payerDepositFeePercent: DEP_B,
      });
      expect(pay.fees.investorBonus).toBe(0);
      expect(pay.payer!.earned).toBe(10_000);
    });
  });

  describe('3) Investor queue does not advertise unpayable WDs', () => {
    it('hides maxPayable 0 and never raises shown max above business cap', () => {
      expect(investorCanSeePayItem(0)).toBe(false);
      expect(investorCanSeePayItem(10_000)).toBe(true);

      // Sequential used to set maxPayable = required even if business cap was 0
      expect(investorQueueShownMaxPayable(0, 10_000)).toBe(0);
      expect(investorQueueShownMaxPayable(4_000, 10_000)).toBe(4_000);
      expect(investorQueueShownMaxPayable(12_000, 10_000)).toBe(10_000);

      const afterList = remainingForPayingListedWithdrawal(200, 10_000);
      expect(investorCanSeePayItem(Math.min(10_000, afterList))).toBe(true);
    });
  });

  describe('4) Cancel / unlist restores remaining', () => {
    it('listed then cancelled restores seed remaining; already-cancelled listed still releases', () => {
      let A = applyListWithdrawal(biz(50_000), 20_000);
      expect(bizRemaining(A)).toBe(30_000);
      expect(A.used).toBe(20_000);

      A = applyUnlistWithdrawal(A, 20_000);
      expect(A.used).toBe(0);
      expect(bizRemaining(A)).toBe(50_000);

      // Stuck after old cancel (listed reserve still in used, status already cancelled)
      let stuck = applyListWithdrawal(biz(50_000), 12_345);
      expect(bizRemaining(stuck)).toBe(37_655);
      stuck = applyUnlistWithdrawal(stuck, 12_345);
      expect(bizRemaining(stuck)).toBe(50_000);

      expect(
        shouldHealCancelledListedQuota({
          status: 'cancelled',
          p2pListStatus: 'listed',
        }),
      ).toBe(true);
      expect(
        shouldHealCancelledListedQuota({
          status: 'rejected',
          p2pListStatus: 'listed',
        }),
      ).toBe(true);
      expect(
        shouldHealCancelledListedQuota({
          status: 'cancelled',
          p2pListStatus: 'rejected',
        }),
      ).toBe(false);
    });

    it('partial pay then cancel remaining unpaid restores only unpaid reserve', () => {
      let A = applyListWithdrawal(biz(50_000), 20_000);
      const paid = applyApproveCrossBizPay({
        wdOwner: A,
        payer: biz(0),
        payAmount: 5_000,
        wdFeePercent: WD_FEE,
        payerDepositFeePercent: DEP_B,
      });
      A = paid.wdOwner;
      const unpaid = 15_000;
      A = applyUnlistWithdrawal(A, unpaid);
      // used: 20000 - 5000 + 500 fee - 15000 unpaid = 500
      expect(A.used).toBe(500);
      expect(A.earned).toBe(0);
    });
  });

  describe('5) Approve writes limit + fee; release stays silent', () => {
    it('keeps list_reserve + fee on ledger; skips only list_release', () => {
      expect(shouldSkipInProcessQuotaLedger('list_reserve')).toBe(false);
      expect(shouldSkipInProcessQuotaLedger('list_release')).toBe(true);
      expect(shouldSkipInProcessQuotaLedger('wd_fee')).toBe(false);
      expect(shouldSkipInProcessQuotaLedger('deposit_fee')).toBe(false);
      expect(shouldSkipInProcessQuotaLedger('user_deposit')).toBe(false);
      expect(shouldSkipInProcessQuotaLedger('user_pay_cross_biz')).toBe(false);

      expect(isInProcessP2pQuotaLedgerRef('withdrawal_list')).toBe(false);
      expect(isInProcessP2pQuotaLedgerRef('withdrawal_unlist')).toBe(true);
      expect(isInProcessP2pQuotaLedgerRef('withdrawal_reject')).toBe(true);
      expect(isInProcessP2pQuotaLedgerRef('withdrawal_cancel')).toBe(true);
      expect(isInProcessP2pQuotaLedgerRef('withdrawal_payment')).toBe(false);
      expect(isInProcessP2pQuotaLedgerRef('deposit')).toBe(false);
    });
  });

  describe('6) Over-limit listing waits for admin', () => {
    it('admin and business both blocked when needed > remaining', () => {
      const remaining = p2pPayQuotaRemaining({
        p2pPayLimit: 10_000,
        p2pPayEarned: 0,
        p2pPayUsed: 0,
      });
      const needed = listApprovalHeadroomNeeded({
        newOpenInr: 10_000,
        newWithdrawalFee: 1_000,
        existingListedOpenFees: 0,
      });
      expect(needed).toBe(11_000);
      expect(needed > remaining).toBe(true);

      expect(
        overLimitListDecision({ needed, remaining, isAdmin: false }),
      ).toBe('block');
      expect(
        overLimitListDecision({ needed, remaining, isAdmin: true }),
      ).toBe('block');
      expect(
        overLimitListDecision({ needed: 5_000, remaining: 10_000, isAdmin: false }),
      ).toBe('list');
    });
  });

  describe('full chain: list → B2 user pay → cancel leftover → over-limit next list', () => {
    it('runs the reported production story without false blocks', () => {
      let A = biz(20_000);
      const B = biz(0);
      const open = 18_000;
      const wdFee = roundMoney((open * WD_FEE) / 100);

      const needed = listApprovalHeadroomNeeded({
        newOpenInr: open,
        newWithdrawalFee: wdFee,
        existingListedOpenFees: 0,
      });
      expect(needed).toBe(19_800);
      expect(overLimitListDecision({ needed, remaining: 20_000, isAdmin: false })).toBe(
        'list',
      );

      A = applyListWithdrawal(A, open);
      expect(bizRemaining(A)).toBe(2_000);

      const payCap = remainingForPayingListedWithdrawal(bizRemaining(A), open);
      expect(payCap).toBe(20_000);
      expect(Math.min(open, payCap)).toBe(open);

      const userPay = applyApproveCrossBizPay({
        wdOwner: A,
        payer: B,
        payAmount: open,
        wdFeePercent: WD_FEE,
        payerDepositFeePercent: DEP_B,
      });
      expect(userPay.fees.investorBonus).toBe(0);
      A = userPay.wdOwner;
      // used = 18000 - 18000 + 1800 fee = 1800 → remaining 18200
      expect(bizRemaining(A)).toBe(18_200);

      const nextOpen = 18_000;
      const nextNeeded = listApprovalHeadroomNeeded({
        newOpenInr: nextOpen,
        newWithdrawalFee: roundMoney((nextOpen * WD_FEE) / 100),
        existingListedOpenFees: 0,
      });
      expect(nextNeeded).toBe(19_800);
      expect(nextNeeded > bizRemaining(A)).toBe(true);
      expect(
        overLimitListDecision({
          needed: nextNeeded,
          remaining: bizRemaining(A),
          isAdmin: false,
        }),
      ).toBe('block');
      expect(
        overLimitListDecision({
          needed: nextNeeded,
          remaining: bizRemaining(A),
          isAdmin: true,
        }),
      ).toBe('block');
    });
  });
});
