import {
  isWithinReferralBonusPeriod,
  referralPercentsForPay,
  referralRewardAmount,
  resolveReferralPercents,
} from './investor-referral-reward.util';

describe('investor-referral-reward.util', () => {
  it('computes percent of principal', () => {
    expect(referralRewardAmount(100, 5)).toBe(5);
    expect(referralRewardAmount(100, 2.5)).toBe(2.5);
    expect(referralRewardAmount(0, 5)).toBe(0);
  });

  it('uses first-pay percents when no prior completed pays', () => {
    expect(
      referralPercentsForPay({
        priorCompletedPays: 0,
        firstReferrerPercent: 2,
        firstJoinerPercent: 1,
        nextReferrerPercent: 0.5,
        nextJoinerPercent: 0,
      }),
    ).toEqual({ isFirst: true, referrerPercent: 2, joinerPercent: 1 });
  });

  it('uses next-pay percents after first completed pay', () => {
    expect(
      referralPercentsForPay({
        priorCompletedPays: 1,
        firstReferrerPercent: 2,
        firstJoinerPercent: 1,
        nextReferrerPercent: 0.5,
        nextJoinerPercent: 0,
      }),
    ).toEqual({ isFirst: false, referrerPercent: 0.5, joinerPercent: 0 });
  });

  describe('period window', () => {
    const from = '2026-09-01';
    const to = '2026-09-30';

    it('isWithinReferralBonusPeriod inclusive of from/to days', () => {
      expect(isWithinReferralBonusPeriod(new Date('2026-09-01T00:00:00'), from, to)).toBe(
        true,
      );
      expect(isWithinReferralBonusPeriod(new Date('2026-09-15T12:00:00'), from, to)).toBe(
        true,
      );
      expect(isWithinReferralBonusPeriod(new Date('2026-09-30T23:00:00'), from, to)).toBe(
        true,
      );
      expect(isWithinReferralBonusPeriod(new Date('2026-08-31T23:00:00'), from, to)).toBe(
        false,
      );
      expect(isWithinReferralBonusPeriod(new Date('2026-10-01T00:00:00'), from, to)).toBe(
        false,
      );
    });

    it('resolveReferralPercents uses period rates inside window', () => {
      expect(
        resolveReferralPercents({
          priorCompletedPays: 0,
          now: new Date('2026-09-10T10:00:00'),
          firstReferrerPercent: 2,
          firstJoinerPercent: 1,
          nextReferrerPercent: 1,
          nextJoinerPercent: 0,
          periodFromDate: from,
          periodToDate: to,
          periodFirstReferrerPercent: 5,
          periodFirstJoinerPercent: 3,
          periodNextReferrerPercent: 2,
          periodNextJoinerPercent: 1,
        }),
      ).toEqual({
        isFirst: true,
        referrerPercent: 5,
        joinerPercent: 3,
        inPeriod: true,
      });
    });

    it('resolveReferralPercents uses default rates outside window', () => {
      expect(
        resolveReferralPercents({
          priorCompletedPays: 1,
          now: new Date('2026-10-05T10:00:00'),
          firstReferrerPercent: 2,
          firstJoinerPercent: 1,
          nextReferrerPercent: 1,
          nextJoinerPercent: 0,
          periodFromDate: from,
          periodToDate: to,
          periodFirstReferrerPercent: 5,
          periodFirstJoinerPercent: 3,
          periodNextReferrerPercent: 2,
          periodNextJoinerPercent: 1,
        }),
      ).toEqual({
        isFirst: false,
        referrerPercent: 1,
        joinerPercent: 0,
        inPeriod: false,
      });
    });

    it('missing period dates keep default rates', () => {
      expect(
        resolveReferralPercents({
          priorCompletedPays: 0,
          now: new Date('2026-09-10T10:00:00'),
          firstReferrerPercent: 2,
          firstJoinerPercent: 1,
          nextReferrerPercent: 1,
          nextJoinerPercent: 0,
        }).inPeriod,
      ).toBe(false);
    });
  });
});
