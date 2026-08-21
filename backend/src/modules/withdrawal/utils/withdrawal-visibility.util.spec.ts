import {
  adminWithdrawalVisibilityFilter,
  availableForPaymentBaseFilter,
  businessWithdrawalVisibilityFilter,
  isInvestorToInvestorPay,
  isOpenOnPayList,
  isWithinUserEditTat,
  remainingTatSeconds,
  tatCutoffDate,
  userCanCancelWithdrawal,
  userCanEditWithdrawal,
} from './withdrawal-visibility.util';

describe('withdrawal-visibility.util (#8 #24)', () => {
  const tatMs = 2 * 60 * 1000; // 2 minutes
  const now = Date.parse('2026-08-17T10:00:00.000Z');

  it('tatCutoffDate is now - tatMs', () => {
    expect(tatCutoffDate(now, tatMs).toISOString()).toBe('2026-08-17T09:58:00.000Z');
  });

  it('isWithinUserEditTat true only inside window', () => {
    const created = new Date(now - 30_000);
    expect(isWithinUserEditTat(created, now, tatMs)).toBe(true);
    expect(isWithinUserEditTat(new Date(now - tatMs - 1), now, tatMs)).toBe(false);
  });

  it('remainingTatSeconds counts down', () => {
    expect(remainingTatSeconds(new Date(now - 30_000), now, tatMs)).toBe(90);
    expect(remainingTatSeconds(new Date(now - tatMs), now, tatMs)).toBe(0);
  });

  describe('who can see withdrawal', () => {
    it('business filter hides rows created after cutoff (still in TAT)', () => {
      const cutoff = tatCutoffDate(now, tatMs);
      expect(businessWithdrawalVisibilityFilter(cutoff)).toEqual({
        $or: [{ createdAt: { $lte: cutoff } }, { origin: 'business' }],
      });
    });

    it('admin filter requires listed OR terminal OR non-business after TAT', () => {
      const cutoff = tatCutoffDate(now, tatMs);
      const f = adminWithdrawalVisibilityFilter(cutoff);
      expect(f.$or).toEqual(
        expect.arrayContaining([
          { p2pListStatus: 'listed' },
          expect.objectContaining({
            status: { $in: ['completed', 'rejected', 'cancelled'] },
          }),
        ]),
      );
    });

    it('available-for-payment is listed-only (business WD needs admin verify)', () => {
      const f = availableForPaymentBaseFilter('user-1');
      expect(f.userId).toEqual({ $ne: 'user-1' });
      expect(f.status).toEqual({ $in: ['pending', 'processing'] });
      expect(f.p2pListStatus).toBe('listed');
      expect(f).not.toHaveProperty('$or');
    });

    it('isOpenOnPayList true only when listed and still open', () => {
      expect(isOpenOnPayList({ p2pListStatus: 'listed', status: 'pending' })).toBe(true);
      expect(isOpenOnPayList({ p2pListStatus: 'awaiting', status: 'pending' })).toBe(false);
      expect(isOpenOnPayList({ p2pListStatus: 'listed', origin: 'business' } as { p2pListStatus: string })).toBe(
        true,
      );
      expect(isOpenOnPayList({ p2pListStatus: 'awaiting', origin: 'business', status: 'pending' })).toBe(
        false,
      );
      expect(isOpenOnPayList({ p2pListStatus: 'listed', status: 'completed' })).toBe(false);
    });
  });

  describe('userCanCancelWithdrawal', () => {
    const created = new Date(now - 20_000);

    it('allows cancel inside TAT when not listed', () => {
      expect(
        userCanCancelWithdrawal({
          status: 'pending',
          p2pListStatus: 'awaiting',
          paidAmount: 0,
          createdAt: created,
          nowMs: now,
          tatMs,
        }),
      ).toBe(true);
    });

    it('blocks cancel after Platform Payment list', () => {
      expect(
        userCanCancelWithdrawal({
          status: 'pending',
          p2pListStatus: 'listed',
          paidAmount: 0,
          createdAt: created,
          nowMs: now,
          tatMs,
        }),
      ).toBe(false);
    });

    it('blocks cancel after TAT expires', () => {
      expect(
        userCanCancelWithdrawal({
          status: 'pending',
          p2pListStatus: 'awaiting',
          paidAmount: 0,
          createdAt: new Date(now - tatMs - 1000),
          nowMs: now,
          tatMs,
        }),
      ).toBe(false);
    });

    it('blocks cancel when paidAmount > 0', () => {
      expect(
        userCanCancelWithdrawal({
          status: 'processing',
          p2pListStatus: 'awaiting',
          paidAmount: 100,
          createdAt: created,
          nowMs: now,
          tatMs,
        }),
      ).toBe(false);
    });
  });

  describe('userCanEditWithdrawal', () => {
    const created = new Date(now - 20_000);

    it('matches cancel rules inside TAT', () => {
      expect(
        userCanEditWithdrawal({
          status: 'pending',
          p2pListStatus: 'awaiting',
          paidAmount: 0,
          createdAt: created,
          nowMs: now,
          tatMs,
        }),
      ).toBe(true);
    });

    it('hides edit after TAT expires', () => {
      expect(
        userCanEditWithdrawal({
          status: 'pending',
          p2pListStatus: 'awaiting',
          paidAmount: 0,
          createdAt: new Date(now - tatMs - 1000),
          nowMs: now,
          tatMs,
        }),
      ).toBe(false);
    });
  });

  it('blocks investor-to-investor pay matching', () => {
    expect(isInvestorToInvestorPay('investor', 'investor')).toBe(true);
    expect(isInvestorToInvestorPay('investor', 'user')).toBe(false);
    expect(isInvestorToInvestorPay('user', 'investor')).toBe(false);
    expect(isInvestorToInvestorPay('user', 'user')).toBe(false);
  });
});
