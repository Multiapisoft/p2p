/**
 * Pure ledger simulators for fee / limit / wallet accounting tests.
 * Mirrors production rules:
 * - Settle full WD from lock BEFORE fee debit (fee must not eat locked principal)
 * - WD + deposit fees: business → admin
 * - Investor bonus / referral: admin → investor (never business)
 * - User deposit: payer business earned +pay, used +depositFee
 * - Business-origin complete: used +gross, hold released; fee also on used
 */

export type WalletSnap = {
  balance: number;
  locked: number;
};

export type QuotaSnap = {
  limit: number;
  earned: number;
  used: number;
  hold: number;
};

export type LedgerRow = {
  party: 'business' | 'admin' | 'investor' | 'withdrawer';
  type: 'withdrawal' | 'commission' | 'p2p_limit' | 'deposit_earn';
  direction: 'debit' | 'credit';
  amount: number;
  balanceAfter?: number;
  remark: string;
};

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function quotaRemaining(q: QuotaSnap): number {
  return roundMoney(Math.max(0, q.limit + q.earned - q.used - q.hold));
}

/** Bug if fee runs first: available shrinks and WD under-pays. */
export function settleWdThenFee(opts: {
  wallet: WalletSnap;
  payAmount: number;
  feeAmount: number;
}): {
  wallet: WalletSnap;
  withdrawalDebit: number;
  feeDebit: number;
  wrongOrderWithdrawalDebit: number;
} {
  const pay = roundMoney(opts.payAmount);
  const fee = roundMoney(opts.feeAmount);

  // Wrong order (historical bug): fee allowOverdraft eats locked funds → under-pay WD
  const wrongOrderWithdrawalDebit = roundMoney(
    Math.min(Math.max(0, opts.wallet.balance - fee), pay),
  );

  // Correct order: unlock+debit full pay, then fee
  let bal = opts.wallet.balance;
  let locked = opts.wallet.locked;
  const unlock = Math.min(locked, pay);
  locked = roundMoney(locked - unlock);
  bal = roundMoney(bal - pay);
  const feeDebit = fee;
  bal = roundMoney(bal - feeDebit);

  return {
    wallet: { balance: bal, locked },
    withdrawalDebit: pay,
    feeDebit,
    wrongOrderWithdrawalDebit,
  };
}

export function applyBusinessOriginComplete(opts: {
  quota: QuotaSnap;
  grossAmount: number;
  wdFee: number;
}): { quota: QuotaSnap; ledger: LedgerRow[] } {
  const gross = roundMoney(opts.grossAmount);
  const fee = roundMoney(opts.wdFee);
  const beforeOpen = { ...opts.quota };
  // Open WD already in hold (ledger wrote hold at create)
  const remWhileOpen = quotaRemaining(beforeOpen);

  // Fee on approve (used += fee) while hold still includes WD
  let q: QuotaSnap = {
    ...beforeOpen,
    used: roundMoney(beforeOpen.used + fee),
  };
  const remAfterFee = quotaRemaining(q);

  // Complete: hold → used for gross (remaining unchanged — skip no-op ledger)
  q = {
    ...q,
    used: roundMoney(q.used + gross),
    hold: roundMoney(Math.max(0, q.hold - gross)),
  };
  const remAfter = quotaRemaining(q);

  const ledger: LedgerRow[] = [
    {
      party: 'business',
      type: 'p2p_limit',
      direction: 'debit',
      amount: fee,
      balanceAfter: remAfterFee,
      remark: `P2P pay limit deducted ₹${fee} (withdrawal fee to admin)`,
    },
  ];
  // No gross consume ledger when rem unchanged (hold already reduced remaining)

  void remWhileOpen;
  void remAfter;
  return { quota: q, ledger };
}

/** Open business WD: remaining drops by principal (hold ledger). */
export function applyBusinessOriginHold(opts: {
  quota: QuotaSnap;
  amount: number;
}): { quota: QuotaSnap; ledger: LedgerRow[] } {
  const amount = roundMoney(opts.amount);
  const remBefore = quotaRemaining(opts.quota);
  const quota: QuotaSnap = {
    ...opts.quota,
    hold: roundMoney(opts.quota.hold + amount),
  };
  const remAfter = quotaRemaining(quota);
  return {
    quota,
    ledger: [
      {
        party: 'business',
        type: 'p2p_limit',
        direction: 'debit',
        amount,
        balanceAfter: remAfter,
        remark: `P2P pay limit held ₹${amount} (business withdrawal open). Remaining ₹${remBefore} → ₹${remAfter}`,
      },
    ],
  };
}

/** Reset pay quota to 0 so next add starts clean. */
export function applyBusinessPayLimitReset(opts: {
  quota: QuotaSnap;
}): { quota: QuotaSnap; ledger: LedgerRow[] } {
  const remBefore = quotaRemaining(opts.quota);
  const quota: QuotaSnap = { limit: 0, earned: 0, used: 0, hold: 0 };
  return {
    quota,
    ledger: [
      {
        party: 'business',
        type: 'p2p_limit',
        direction: remBefore > 0 ? 'debit' : 'credit',
        amount: Math.max(remBefore, opts.quota.limit, 0.01),
        balanceAfter: 0,
        remark: `P2P pay limit reset ₹${opts.quota.limit} → ₹0. Remaining ₹${remBefore} → ₹0`,
      },
    ],
  };
}

/** Admin adds seed pay limit. */
export function applyBusinessPayLimitAdd(opts: {
  quota: QuotaSnap;
  amount: number;
}): { quota: QuotaSnap; ledger: LedgerRow[] } {
  const amount = roundMoney(opts.amount);
  const remBefore = quotaRemaining(opts.quota);
  const quota: QuotaSnap = {
    ...opts.quota,
    limit: roundMoney(opts.quota.limit + amount),
  };
  const remAfter = quotaRemaining(quota);
  return {
    quota,
    ledger: [
      {
        party: 'business',
        type: 'p2p_limit',
        direction: 'credit',
        amount,
        balanceAfter: remAfter,
        remark: `P2P pay limit added ₹${amount}. Remaining ₹${remBefore} → ₹${remAfter}`,
      },
    ],
  };
}

export function applyUserDepositQuota(opts: {
  payer: QuotaSnap;
  payAmount: number;
  depositFee: number;
}): { payer: QuotaSnap; ledger: LedgerRow[] } {
  const pay = roundMoney(opts.payAmount);
  const fee = roundMoney(opts.depositFee);
  const remBefore = quotaRemaining(opts.payer);
  const payer: QuotaSnap = {
    ...opts.payer,
    earned: roundMoney(opts.payer.earned + pay),
    used: roundMoney(opts.payer.used + fee),
  };
  const remAfterEarn = quotaRemaining({
    ...opts.payer,
    earned: payer.earned,
  });
  const remAfter = quotaRemaining(payer);
  return {
    payer,
    ledger: [
      {
        party: 'business',
        type: 'deposit_earn',
        direction: 'credit',
        amount: pay,
        balanceAfter: remAfterEarn,
        remark: `P2P pay limit earned ₹${pay} (user deposit)`,
      },
      {
        party: 'business',
        type: 'p2p_limit',
        direction: 'debit',
        amount: fee,
        balanceAfter: remAfter,
        remark: `P2P pay limit deducted ₹${fee} (deposit fee to admin)`,
      },
    ],
  };
}

export function applyAdminFeeAndInvestorBonus(opts: {
  adminBalance: number;
  businessBalance: number;
  wdFee: number;
  depositFee: number;
  investorBonus: number;
}): {
  adminBalance: number;
  businessBalance: number;
  ledger: LedgerRow[];
} {
  const wd = roundMoney(opts.wdFee);
  const dep = roundMoney(opts.depositFee);
  const bonus = roundMoney(opts.investorBonus);
  let admin = roundMoney(opts.adminBalance);
  let biz = roundMoney(opts.businessBalance);
  const ledger: LedgerRow[] = [];

  if (wd > 0) {
    biz = roundMoney(biz - wd);
    admin = roundMoney(admin + wd);
    ledger.push({
      party: 'admin',
      type: 'commission',
      direction: 'credit',
      amount: wd,
      balanceAfter: admin,
      remark: `Business fee ₹${wd} received (WD fee)`,
    });
    ledger.push({
      party: 'business',
      type: 'commission',
      direction: 'debit',
      amount: wd,
      balanceAfter: biz,
      remark: `Business fee ₹${wd} paid to admin`,
    });
  }
  if (dep > 0) {
    biz = roundMoney(biz - dep);
    admin = roundMoney(admin + dep);
    ledger.push({
      party: 'admin',
      type: 'commission',
      direction: 'credit',
      amount: dep,
      balanceAfter: admin,
      remark: `Business fee ₹${dep} received (deposit fee)`,
    });
  }
  if (bonus > 0) {
    // Investor bonus: admin only — business untouched for this step
    const bizBeforeBonus = biz;
    admin = roundMoney(admin - bonus);
    ledger.push({
      party: 'admin',
      type: 'commission',
      direction: 'debit',
      amount: bonus,
      balanceAfter: admin,
      remark: `Investor commission ₹${bonus} paid to investor`,
    });
    ledger.push({
      party: 'investor',
      type: 'commission',
      direction: 'credit',
      amount: bonus,
      remark: `Investor commission ₹${bonus} from admin`,
    });
    // Guard: business balance must not change on investor bonus
    if (biz !== bizBeforeBonus) {
      throw new Error('Investor bonus must not debit business wallet');
    }
  }

  return { adminBalance: admin, businessBalance: biz, ledger };
}
