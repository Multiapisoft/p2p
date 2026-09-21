import { TransactionStatus } from '../../../common/enums/transaction-status.enum';

/**
 * Concurrent approve/confirm must not both settle the same payment.
 * Only one caller may claim PENDING → PROCESSING.
 */
export function paymentApproveClaimFilter(paymentId: string) {
  return {
    _id: paymentId,
    status: TransactionStatus.PENDING,
  };
}
