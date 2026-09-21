import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { paymentApproveClaimFilter } from './payment-approve-claim.util';

describe('paymentApproveClaimFilter', () => {
  it('claims only pending payments', () => {
    expect(paymentApproveClaimFilter('abc')).toEqual({
      _id: 'abc',
      status: TransactionStatus.PENDING,
    });
  });
});
