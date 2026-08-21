import { visibleInvestorBonusAmount } from './investor-commission-visibility.util';

describe('visibleInvestorBonusAmount', () => {
  it('shows bonus to investor when toggle is on', () => {
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'investor',
        showToInvestor: true,
        bonusAmount: 150,
      }),
    ).toBe(150);
  });

  it('hides bonus from investor when toggle is off', () => {
    expect(
      visibleInvestorBonusAmount({
        viewerRole: 'investor',
        showToInvestor: false,
        bonusAmount: 150,
      }),
    ).toBe(0);
  });

  it('still shows bonus to regular users (toggle is investor-only)', () => {
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
