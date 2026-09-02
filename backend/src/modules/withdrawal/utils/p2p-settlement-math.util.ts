import { p2pPayQuotaRemaining } from '../../business/utils/p2p-pay-quota.util';

/** Round to 2 decimal places (INR paise). */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Percentage fee matching commission.service computeAmount (percentage mode). */
export function percentFee(amount: number, percent: number): number {
  return roundMoney((amount * percent) / 100);
}

export type BizQuotaState = {
  /** Admin seed (p2pPayLimit) */
  limit: number;
  /** Deposit-earned (p2pPayEarned) */
  earned: number;
  /** Reserved + consumed (p2pPayUsed) */
  used: number;
};

export function bizRemaining(state: BizQuotaState): number {
  return p2pPayQuotaRemaining({
    p2pPayLimit: state.limit,
    p2pPayEarned: state.earned,
    p2pPayUsed: state.used,
  });
}

/** List WD for P2P → reserve open amount on WD-owner business. */
export function applyListWithdrawal(state: BizQuotaState, openAmount: number): BizQuotaState {
  const amt = roundMoney(Math.max(0, openAmount));
  return { ...state, used: roundMoney(state.used + amt) };
}

/** Unlist / cancel list → release unpaid reserved amount. */
export function applyUnlistWithdrawal(state: BizQuotaState, unpaidAmount: number): BizQuotaState {
  const amt = roundMoney(Math.max(0, unpaidAmount));
  return { ...state, used: roundMoney(Math.max(0, state.used - amt)) };
}

export type FeeSplit = {
  withdrawalFee: number;
  depositFee: number;
  investorBonus: number;
  /** Total credited to admin before investor bonus cut */
  adminFeeIn: number;
};

/**
 * Fees on a completed pay:
 * - WD fee % from WD-owner business
 * - Deposit fee % from payer business (0 for investors)
 * - Investor bonus % from WD-owner rates (paid from admin commission wallet)
 */
export function computePayFees(opts: {
  payAmount: number;
  wdFeePercent: number;
  depositFeePercent: number;
  investorBonusPercent?: number;
  isInvestor?: boolean;
}): FeeSplit {
  const pay = roundMoney(opts.payAmount);
  const withdrawalFee = percentFee(pay, opts.wdFeePercent);
  const depositFee = opts.isInvestor ? 0 : percentFee(pay, opts.depositFeePercent);
  const investorBonus =
    opts.isInvestor && opts.investorBonusPercent
      ? percentFee(pay, opts.investorBonusPercent)
      : 0;
  return {
    withdrawalFee,
    depositFee,
    investorBonus,
    adminFeeIn: roundMoney(withdrawalFee + depositFee),
  };
}

export type ApprovePayResult = {
  wdOwner: BizQuotaState;
  payer: BizQuotaState | null;
  fees: FeeSplit;
  /** Net admin wallet delta: fees in − investor bonus out */
  adminWalletDelta: number;
};

/**
 * Same-business user pay:
 * - Keep list reserve consumed (do NOT release)
 * - Earn +pay on this business (deposit side → limit increases)
 * - Consume WD fee + deposit fee from the same business limit
 *
 * Net remaining vs list: −fees only (same as old release model, clearer ledger).
 */
export function applyApproveSameBizPay(opts: {
  state: BizQuotaState;
  payAmount: number;
  wdFeePercent: number;
  depositFeePercent: number;
}): ApprovePayResult {
  const pay = roundMoney(opts.payAmount);
  const fees = computePayFees({
    payAmount: pay,
    wdFeePercent: opts.wdFeePercent,
    depositFeePercent: opts.depositFeePercent,
    isInvestor: false,
  });
  const earned = roundMoney(opts.state.earned + pay);
  const used = roundMoney(opts.state.used + fees.withdrawalFee + fees.depositFee);
  return {
    wdOwner: { ...opts.state, earned, used },
    payer: null,
    fees,
    adminWalletDelta: fees.adminFeeIn,
  };
}

/**
 * Cross-business user pay:
 * - WD owner: release pay, consume WD fee
 * - Payer biz: earned +pay, consume deposit fee (payer's deposit %)
 */
export function applyApproveCrossBizPay(opts: {
  wdOwner: BizQuotaState;
  payer: BizQuotaState;
  payAmount: number;
  wdFeePercent: number;
  payerDepositFeePercent: number;
}): ApprovePayResult {
  const pay = roundMoney(opts.payAmount);
  const fees = computePayFees({
    payAmount: pay,
    wdFeePercent: opts.wdFeePercent,
    depositFeePercent: opts.payerDepositFeePercent,
    isInvestor: false,
  });
  const wdOwner = {
    ...opts.wdOwner,
    used: roundMoney(opts.wdOwner.used - pay + fees.withdrawalFee),
  };
  const payer = {
    ...opts.payer,
    earned: roundMoney(opts.payer.earned + pay),
    used: roundMoney(opts.payer.used + fees.depositFee),
  };
  return {
    wdOwner,
    payer,
    fees,
    adminWalletDelta: fees.adminFeeIn,
  };
}

/**
 * Investor pays open amount:
 * - Do NOT release list reserve (investor pays must not boost business remaining)
 * - Consume WD fee only; no deposit fee; investor bonus leaves admin commission wallet
 */
export function applyApproveInvestorPay(opts: {
  wdOwner: BizQuotaState;
  payAmount: number;
  wdFeePercent: number;
  investorBonusPercent: number;
}): ApprovePayResult {
  const pay = roundMoney(opts.payAmount);
  const fees = computePayFees({
    payAmount: pay,
    wdFeePercent: opts.wdFeePercent,
    depositFeePercent: 0,
    investorBonusPercent: opts.investorBonusPercent,
    isInvestor: true,
  });
  const wdOwner = {
    ...opts.wdOwner,
    used: roundMoney(opts.wdOwner.used + fees.withdrawalFee),
  };
  return {
    wdOwner,
    payer: null,
    fees,
    adminWalletDelta: roundMoney(fees.adminFeeIn - fees.investorBonus),
  };
}

export { assignDefinedFields } from '../../business/utils/assign-defined.util';
