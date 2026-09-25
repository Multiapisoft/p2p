/** Partial dispute receive: verify only receivedAmount; unlock the shortfall. */

export function normalizeDisputeReceivedAmount(
  disputedAmount: number,
  receivedAmount?: number | null,
): { approveAmount: number; unlockAmount: number; originalAmount: number } {
  const original = Math.round(Math.max(0, Number(disputedAmount) || 0) * 100) / 100;
  if (receivedAmount == null || receivedAmount === undefined) {
    return { approveAmount: original, unlockAmount: 0, originalAmount: original };
  }
  const received = Math.round(Number(receivedAmount) * 100) / 100;
  if (!Number.isFinite(received) || received <= 0) {
    throw new Error('Received amount must be greater than 0');
  }
  if (received > original + 0.001) {
    throw new Error(`Received amount cannot exceed disputed amount (₹${original})`);
  }
  const approveAmount = Math.min(original, received);
  const unlockAmount = Math.round((original - approveAmount) * 100) / 100;
  return { approveAmount, unlockAmount, originalAmount: original };
}
