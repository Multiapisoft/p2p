import { visibleInvestorBonusAmount } from './investor-commission-visibility.util';

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

  it('shows bonus for other roles the same way', () => {
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'user',
        showToInvestor: false,
        bonusAmount: 80,
      }),
    ).toBe(80);
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
