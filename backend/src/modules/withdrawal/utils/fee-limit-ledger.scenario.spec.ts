import {
  applyAdminFeeAndInvestorBonus,
  applyBusinessOriginComplete,
  applyUserDepositQuota,
  quotaRemaining,
  settleWdThenFee,
  type QuotaSnap,
} from './fee-limit-ledger.scenario.util';
import {
  applyApproveCrossBizPay,
  applyApproveInvestorPay,
  applyApproveSameBizPay,
  applyListWithdrawal,
  bizRemaining,
  computePayFees,
  type BizQuotaState,
} from './p2p-settlement-math.util';
import {
  businessFeeInDescription,
  businessFeeOutFromBusinessDescription,
  investorCommissionInDescription,
  investorCommissionOutDescription,
} from '../../wallet/utils/platform-commission-ledger.util';
import { p2pPayQuotaLedgerDescription } from '../../business/utils/p2p-pay-quota-ledger.util';
import { Currency } from '../../../common/enums/currency.enum';

/**
 * Complete ledger scenarios for:
 * 1) Business WD ₹10k — full settle + fee separate (not 9800)
 * 2) User deposit — payer business limit up + deposit fee
 * 3) All fees → admin; investor bonus ← admin (not business)
 * 4) Cross-biz / same-biz / investor pay limit math
 */
describe('fee + limit + ledger — complete scenarios', () => {
  const WD_PCT = 2;
  const DEP_PCT = 2;

  describe('1) Business-origin ₹10k WD — settle full then fee', () => {
    it('withdrawal debit is ₹10,000; fee ₹200 is extra (wrong order would pay ₹9,800)', () => {
      const lockedWallet = { balance: 10_000, locked: 10_000 };
      const result = settleWdThenFee({
        wallet: lockedWallet,
        payAmount: 10_000,
        feeAmount: 200,
      });

      expect(result.withdrawalDebit).toBe(10_000);
      expect(result.feeDebit).toBe(200);
      expect(result.wallet.balance).toBe(-200); // overdraft fee after full settle
      expect(result.wallet.locked).toBe(0);

      // Historical bug: fee first → only ₹9,800 left for WD
      expect(result.wrongOrderWithdrawalDebit).toBe(9_800);
      expect(result.withdrawalDebit).not.toBe(result.wrongOrderWithdrawalDebit);
    });

    it('pay limit burns ₹10,000 gross + ₹200 fee; remaining drops by ₹10,200 net', () => {
      const seed: QuotaSnap = {
        limit: 100_000,
        earned: 0,
        used: 0,
        hold: 10_000, // open business WD
      };
      expect(quotaRemaining(seed)).toBe(90_000);

      const { quota, ledger } = applyBusinessOriginComplete({
        quota: seed,
        grossAmount: 10_000,
        wdFee: 200,
      });

      expect(quota.used).toBe(10_200); // 200 fee + 10_000 gross
      expect(quota.hold).toBe(0);
      expect(quotaRemaining(quota)).toBe(89_800);

      expect(ledger).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'p2p_limit',
            amount: 200,
            remark: expect.stringContaining('withdrawal fee'),
          }),
          expect.objectContaining({
            type: 'p2p_limit',
            amount: 10_000,
          }),
        ]),
      );

      // Ledger copy matches util descriptions
      expect(
        p2pPayQuotaLedgerDescription({
          action: 'deduct',
          amount: 200,
          remainingBefore: 90_000,
          remainingAfter: 89_800,
          reason: 'wd_fee',
        }),
      ).toContain('withdrawal fee to admin');
      expect(
        p2pPayQuotaLedgerDescription({
          action: 'deduct',
          amount: 10_000,
          remainingBefore: 89_800,
          remainingAfter: 89_800,
        }),
      ).toContain('P2P pay limit deducted ₹10000');
    });

    it('₹30k WD: full ₹30,000 settle + ₹600 fee (not ₹28,800)', () => {
      const r = settleWdThenFee({
        wallet: { balance: 30_000, locked: 30_000 },
        payAmount: 30_000,
        feeAmount: 600,
      });
      expect(r.withdrawalDebit).toBe(30_000);
      expect(r.feeDebit).toBe(600);
      expect(r.wrongOrderWithdrawalDebit).toBe(29_400);
    });
  });

  describe('2) User deposit — payer business limit up + fee deduct', () => {
    it('Biz B user deposits ₹10,000 @ 2% → earned +10000, used +200, rem +9800 net', () => {
      const payer: QuotaSnap = { limit: 0, earned: 0, used: 0, hold: 0 };
      const { payer: after, ledger } = applyUserDepositQuota({
        payer,
        payAmount: 10_000,
        depositFee: 200,
      });

      expect(after.earned).toBe(10_000);
      expect(after.used).toBe(200);
      expect(quotaRemaining(after)).toBe(9_800);

      expect(ledger[0]).toMatchObject({
        type: 'deposit_earn',
        direction: 'credit',
        amount: 10_000,
      });
      expect(ledger[1]).toMatchObject({
        type: 'p2p_limit',
        direction: 'debit',
        amount: 200,
      });

      expect(
        p2pPayQuotaLedgerDescription({
          action: 'add',
          amount: 10_000,
          remainingBefore: 0,
          remainingAfter: 10_000,
          reason: 'user_deposit',
        }),
      ).toBe('P2P pay limit earned ₹10000 (user deposit). Remaining ₹0 → ₹10000');

      expect(
        p2pPayQuotaLedgerDescription({
          action: 'deduct',
          amount: 200,
          remainingBefore: 10_000,
          remainingAfter: 9_800,
          reason: 'deposit_fee',
        }),
      ).toContain('deposit fee to admin');
    });

    it('cross-biz pay: WD owner pays WD fee; payer biz earns + deposit fee', () => {
      let A: BizQuotaState = { limit: 50_000, earned: 0, used: 0 };
      A = applyListWithdrawal(A, 10_000);
      const B: BizQuotaState = { limit: 0, earned: 0, used: 0 };

      const r = applyApproveCrossBizPay({
        wdOwner: A,
        payer: B,
        payAmount: 10_000,
        wdFeePercent: WD_PCT,
        payerDepositFeePercent: DEP_PCT,
      });

      expect(r.fees.withdrawalFee).toBe(200);
      expect(r.fees.depositFee).toBe(200);
      expect(r.fees.investorBonus).toBe(0);
      // A: release 10k list, keep 200 WD fee → used = 200
      expect(r.wdOwner.used).toBe(200);
      expect(bizRemaining(r.wdOwner)).toBe(49_800);
      // B: +10k earned, +200 deposit fee used
      expect(r.payer!.earned).toBe(10_000);
      expect(r.payer!.used).toBe(200);
      expect(bizRemaining(r.payer!)).toBe(9_800);
    });

    it('same-biz user pay: earn +pay and both fees on same business', () => {
      let A = applyListWithdrawal({ limit: 100_000, earned: 0, used: 0 }, 10_000);
      const r = applyApproveSameBizPay({
        state: A,
        payAmount: 10_000,
        wdFeePercent: WD_PCT,
        depositFeePercent: DEP_PCT,
      });
      expect(r.fees.withdrawalFee).toBe(200);
      expect(r.fees.depositFee).toBe(200);
      expect(r.wdOwner.earned).toBe(10_000);
      // list reserve 10k still in used + 200 + 200 fees
      expect(r.wdOwner.used).toBe(10_400);
      expect(bizRemaining(r.wdOwner)).toBe(100_000 + 10_000 - 10_400);
    });
  });

  describe('3) Fees → admin; investor bonus ← admin (not business)', () => {
    it('WD + deposit fees credit admin; investor bonus debits admin only', () => {
      const fees = computePayFees({
        payAmount: 10_000,
        wdFeePercent: WD_PCT,
        depositFeePercent: DEP_PCT,
        investorBonusPercent: 2,
        isInvestor: true,
      });
      // Investor: deposit fee 0, WD fee 200, bonus 200
      expect(fees.withdrawalFee).toBe(200);
      expect(fees.depositFee).toBe(0);
      expect(fees.investorBonus).toBe(200);
      expect(fees.adminFeeIn).toBe(200);

      const startBiz = 50_000;
      const startAdmin = 1_000;
      const r = applyAdminFeeAndInvestorBonus({
        adminBalance: startAdmin,
        businessBalance: startBiz,
        wdFee: fees.withdrawalFee,
        depositFee: fees.depositFee,
        investorBonus: fees.investorBonus,
      });

      // Admin: +200 fee −200 bonus = unchanged
      expect(r.adminBalance).toBe(1_000);
      // Business: only WD fee −200 (bonus must not touch business)
      expect(r.businessBalance).toBe(49_800);

      const adminCredits = r.ledger.filter(
        (l) => l.party === 'admin' && l.direction === 'credit',
      );
      const adminDebits = r.ledger.filter(
        (l) => l.party === 'admin' && l.direction === 'debit',
      );
      const bizDebits = r.ledger.filter(
        (l) => l.party === 'business' && l.direction === 'debit',
      );

      expect(adminCredits.reduce((s, l) => s + l.amount, 0)).toBe(200);
      expect(adminDebits.reduce((s, l) => s + l.amount, 0)).toBe(200);
      expect(bizDebits.every((l) => l.remark.includes('Business fee'))).toBe(true);
      expect(bizDebits.some((l) => l.remark.includes('Investor'))).toBe(false);
    });

    it('user pay (no investor): both fees to admin, no investor bonus debit', () => {
      const fees = computePayFees({
        payAmount: 10_000,
        wdFeePercent: WD_PCT,
        depositFeePercent: DEP_PCT,
        isInvestor: false,
      });
      expect(fees.adminFeeIn).toBe(400);

      const r = applyAdminFeeAndInvestorBonus({
        adminBalance: 0,
        businessBalance: 20_000,
        wdFee: fees.withdrawalFee,
        depositFee: fees.depositFee,
        investorBonus: 0,
      });
      expect(r.adminBalance).toBe(400);
      expect(r.businessBalance).toBe(19_600);
      expect(r.ledger.filter((l) => l.party === 'investor')).toHaveLength(0);
    });

    it('ledger description strings match admin / business / investor copy', () => {
      expect(
        businessFeeInDescription({
          amount: 200,
          currency: Currency.INR,
          fromName: 'Acme (business)',
          referenceLabel: 'PAY-1',
        }),
      ).toBe('Business fee ₹200 received from Acme (business) (PAY-1)');

      expect(
        businessFeeOutFromBusinessDescription({
          amount: 200,
          currency: Currency.INR,
          toName: 'Site Admin (admin)',
          referenceLabel: 'PAY-1',
        }),
      ).toBe('Business fee ₹200 paid to Site Admin (admin) (PAY-1)');

      expect(
        investorCommissionOutDescription({
          amount: 200,
          currency: Currency.INR,
          toName: 'Anita (investor)',
          referenceLabel: 'PAY-1',
        }),
      ).toBe('Investor commission ₹200 paid to Anita (investor) (PAY-1)');

      expect(
        investorCommissionInDescription({
          amount: 200,
          currency: Currency.INR,
          referenceLabel: 'PAY-1',
        }),
      ).toBe('Bonus ₹200 credited (PAY-1)');
    });
  });

  describe('4) Investor pay on listed WD — limit + admin wallet chain', () => {
    it('investor does not boost business earned; WD fee on used; bonus from admin', () => {
      let A = applyListWithdrawal({ limit: 100_000, earned: 0, used: 0 }, 10_000);
      const remAfterList = bizRemaining(A);
      expect(remAfterList).toBe(90_000);

      const r = applyApproveInvestorPay({
        wdOwner: A,
        payAmount: 10_000,
        wdFeePercent: WD_PCT,
        investorBonusPercent: 2,
      });

      expect(r.fees.depositFee).toBe(0);
      expect(r.fees.withdrawalFee).toBe(200);
      expect(r.fees.investorBonus).toBe(200);
      expect(r.wdOwner.earned).toBe(0); // no deposit earn from investor
      expect(r.wdOwner.used).toBe(10_200); // list 10k kept + fee 200
      expect(bizRemaining(r.wdOwner)).toBe(89_800);
      expect(r.adminWalletDelta).toBe(0); // +200 fee −200 bonus

      const wallets = applyAdminFeeAndInvestorBonus({
        adminBalance: 500,
        businessBalance: 80_000,
        wdFee: r.fees.withdrawalFee,
        depositFee: 0,
        investorBonus: r.fees.investorBonus,
      });
      expect(wallets.adminBalance).toBe(500);
      expect(wallets.businessBalance).toBe(79_800);
    });
  });

  describe('5) Full chain ledger: seed → business WD → user deposit', () => {
    it('matches product story: 100k seed, 10k WD+2% fee, then B user 5k deposit+2%', () => {
      // Biz A seed
      let A: QuotaSnap = { limit: 100_000, earned: 0, used: 0, hold: 0 };
      expect(quotaRemaining(A)).toBe(100_000);

      // Business WD 10k open
      A = { ...A, hold: 10_000 };
      expect(quotaRemaining(A)).toBe(90_000);

      const wdDone = applyBusinessOriginComplete({
        quota: A,
        grossAmount: 10_000,
        wdFee: 200,
      });
      A = wdDone.quota;
      expect(quotaRemaining(A)).toBe(89_800);

      // Wallet settle for that WD
      const settle = settleWdThenFee({
        wallet: { balance: 10_000, locked: 10_000 },
        payAmount: 10_000,
        feeAmount: 200,
      });
      expect(settle.withdrawalDebit).toBe(10_000);
      expect(settle.feeDebit).toBe(200);

      // Biz B user deposits 5k onto someone else's WD (payer side only)
      let B: QuotaSnap = { limit: 0, earned: 0, used: 0, hold: 0 };
      const dep = applyUserDepositQuota({
        payer: B,
        payAmount: 5_000,
        depositFee: 100,
      });
      B = dep.payer;
      expect(quotaRemaining(B)).toBe(4_900);

      // Admin collected: WD fee 200 + deposit fee 100
      const admin = applyAdminFeeAndInvestorBonus({
        adminBalance: 0,
        businessBalance: 1_000_000,
        wdFee: 200,
        depositFee: 100,
        investorBonus: 0,
      });
      expect(admin.adminBalance).toBe(300);
    });
  });
});
