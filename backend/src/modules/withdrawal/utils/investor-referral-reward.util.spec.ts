import {
  referralPercentsForPay,
  referralRewardAmount,
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
});
