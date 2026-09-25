import { normalizeDisputeReceivedAmount } from './dispute-received-amount.util';

describe('normalizeDisputeReceivedAmount', () => {
  it('defaults to full disputed amount', () => {
    expect(normalizeDisputeReceivedAmount(10_000)).toEqual({
      approveAmount: 10_000,
      unlockAmount: 0,
      originalAmount: 10_000,
    });
  });

  it('partial receive: 10k dispute → 5k approve + 5k unlock', () => {
    expect(normalizeDisputeReceivedAmount(10_000, 5_000)).toEqual({
      approveAmount: 5_000,
      unlockAmount: 5_000,
      originalAmount: 10_000,
    });
  });

  it('rejects zero / over disputed', () => {
    expect(() => normalizeDisputeReceivedAmount(10_000, 0)).toThrow(/greater than 0/);
    expect(() => normalizeDisputeReceivedAmount(10_000, 10_001)).toThrow(/cannot exceed/);
  });
});
