import {
  businessLedgerDuplicateHideClauses,
  expectedBusinessWdLedgerVisible,
} from './business-ledger-hide.util';
import { LedgerDirection, LedgerFlow, LedgerType } from '../../../common/enums/currency.enum';

describe('business ledger hide (fee once on pay-limit)', () => {
  it('hides wallet fee OUT for payment + direct mark-paid, keeps limit fee refs visible', () => {
    const clauses = businessLedgerDuplicateHideClauses();
    expect(clauses).toEqual(
      expect.arrayContaining([
        { type: { $ne: LedgerType.LOCK } },
        expect.objectContaining({
          $nor: [
            expect.objectContaining({
              type: LedgerType.COMMISSION,
              direction: LedgerDirection.DEBIT,
              flow: LedgerFlow.PLATFORM_FEE,
              referenceType: {
                $in: [
                  'withdrawal_payment',
                  'business_withdrawal',
                  'withdrawal',
                  'withdrawal_list_fee',
                  'wd_fee_settle',
                ],
              },
            }),
          ],
        }),
      ]),
    );
    const refClause = clauses.find(
      (c) => c.referenceType && typeof c.referenceType === 'object',
    ) as { referenceType: { $nin: string[] } };
    expect(refClause.referenceType.$nin).toEqual(
      expect.arrayContaining(['withdrawal_list_fee_refund']),
    );
    expect(refClause.referenceType.$nin).not.toContain('withdrawal_payment_fee');
    expect(refClause.referenceType.$nin).not.toContain('withdrawal_payment_deposit_fee');
  });

  it('expects full WD + hold limit + fee limit on ledger', () => {
    expect(expectedBusinessWdLedgerVisible({ gross: 10_000, fee: 200 })).toEqual([
      { type: 'withdrawal', amount: 10_000, kind: 'full_settle' },
      { type: 'p2p_limit', amount: 10_000, kind: 'hold' },
      { type: 'p2p_limit', amount: 200, kind: 'wd_fee' },
    ]);
  });
});
