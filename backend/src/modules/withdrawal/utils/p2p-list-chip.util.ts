/** Admin/business list chip: never show “Awaiting Platform Payment” on completed/full-paid rows. */
export function shouldShowP2pListChip(w: {
  status?: string;
  amount?: number;
  paidAmount?: number;
  remainingAmount?: number;
}): boolean {
  const status = w.status || '';
  if (['completed', 'cancelled', 'rejected', 'failed'].includes(status)) {
    return false;
  }
  const remaining =
    w.remainingAmount != null
      ? w.remainingAmount
      : Math.max(0, (w.amount || 0) - (w.paidAmount || 0));
  if (remaining <= 0) return false;
  return status === 'pending' || status === 'processing';
}
