import {
  isInvestorPayerRole,
  visibleInvestorBonusAmount,
} from './investor-commission-visibility.util';

describe('isInvestorPayerRole', () => {
  it('is true only for investor', () => {
    expect(isInvestorPayerRole('investor')).toBe(true);
    expect(isInvestorPayerRole('INVESTOR')).toBe(true);
    expect(isInvestorPayerRole('user')).toBe(false);
    expect(isInvestorPayerRole('business')).toBe(false);
    expect(isInvestorPayerRole(null)).toBe(false);
  });
});

describe('visibleInvestorBonusAmount', () => {
  it('always shows bonus to investor (even if legacy toggle off)', () => {
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'investor',
        showToInvestor: false,
        bonusAmount: 150,
      }),
    ).toBe(150);
  });

  it('shows bonus when toggle is on', () => {
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'investor',
        showToInvestor: true,
        bonusAmount: 150,
      }),
    ).toBe(150);
  });

  it('hides bonus for business users and other non-investor roles', () => {
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'user',
        showToInvestor: false,
        bonusAmount: 80,
      }),
    ).toBe(0);
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'business',
        showToInvestor: true,
        bonusAmount: 80,
      }),
    ).toBe(0);
  });

  it('never returns negative', () => {
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'investor',
        showToInvestor: true,
        bonusAmount: -10,
      }),
    ).toBe(0);
  });
});
