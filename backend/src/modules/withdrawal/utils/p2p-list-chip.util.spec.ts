import { shouldShowP2pListChip } from './p2p-list-chip.util';

describe('shouldShowP2pListChip', () => {
  it('hides chip when status is completed', () => {
    expect(
      shouldShowP2pListChip({
        status: 'completed',
        amount: 5000,
        paidAmount: 5000,
        remainingAmount: 0,
      }),
    ).toBe(false);
  });

  it('hides chip when remaining is 0 even if still processing', () => {
    expect(
      shouldShowP2pListChip({
        status: 'processing',
        amount: 10000,
        paidAmount: 10000,
        remainingAmount: 0,
      }),
    ).toBe(false);
  });

  it('shows chip only while open (pending/processing with remaining)', () => {
    expect(
      shouldShowP2pListChip({
        status: 'pending',
        amount: 5000,
        paidAmount: 0,
        remainingAmount: 5000,
      }),
    ).toBe(true);
    expect(
      shouldShowP2pListChip({
        status: 'processing',
        amount: 5000,
        paidAmount: 2000,
        remainingAmount: 3000,
      }),
    ).toBe(true);
  });

  it('hides cancelled / rejected', () => {
    expect(shouldShowP2pListChip({ status: 'cancelled', remainingAmount: 5000 })).toBe(
      false,
    );
    expect(shouldShowP2pListChip({ status: 'rejected', remainingAmount: 5000 })).toBe(
      false,
    );
  });
});
