import { LedgerDirection, LedgerFlow, LedgerType } from '../../../common/enums/currency.enum';
import { IN_PROCESS_P2P_QUOTA_LEDGER_REFS } from '../../business/utils/p2p-pay-quota-ledger.util';

/**
 * Wallet COMMISSION OUT refs that pair with a pay-limit fee row — hide these.
 * Business shows fee once on pay-limit (withdrawal_payment_fee / deposit_fee).
 * Admin wallet IN still uses these refs (admin ledger is unfiltered).
 */
export const HIDDEN_WALLET_FEE_OUT_REFS = [
  'withdrawal_payment',
  'business_withdrawal',
  'withdrawal',
  'withdrawal_list_fee',
  // Per-payment wallet settle when list already burned pay-limit fee
  'wd_fee_settle',
] as const;

/**
 * Business portal ledger filters when hideP2pFeeDuplicates is on:
 * - Hide lock / in-process list quota noise
 * - Hide wallet fee OUT (business → admin) for P2P pays + direct mark-paid —
 *   the paired pay-limit fee row (withdrawal_payment_fee / deposit_fee) is the one we show
 * - Hide backfill/relink refund noise (real cancel refunds use same ref — also hide
 *   because cancel already posts pay-limit release rows)
 * - Keep: full withdrawal, pay-limit fee, deposits, etc.
 */
export function businessLedgerDuplicateHideClauses(): Record<string, unknown>[] {
  return [
    { type: { $ne: LedgerType.LOCK } },
    {
      referenceType: {
        $nin: [
          ...IN_PROCESS_P2P_QUOTA_LEDGER_REFS,
          'withdrawal_list_fee_refund',
        ],
      },
    },
    {
      $nor: [
        {
          type: LedgerType.COMMISSION,
          direction: LedgerDirection.DEBIT,
          flow: LedgerFlow.PLATFORM_FEE,
          referenceType: { $in: [...HIDDEN_WALLET_FEE_OUT_REFS] },
        },
      ],
    },
  ];
}

/** Rows that should remain visible for a ₹10k business WD + 2% fee. */
export function expectedBusinessWdLedgerVisible(opts: {
  gross: number;
  fee: number;
}): { type: string; amount: number; kind: string }[] {
  return [
    { type: 'withdrawal', amount: opts.gross, kind: 'full_settle' },
    { type: 'p2p_limit', amount: opts.gross, kind: 'hold' },
    { type: 'p2p_limit', amount: opts.fee, kind: 'wd_fee' },
  ];
}
