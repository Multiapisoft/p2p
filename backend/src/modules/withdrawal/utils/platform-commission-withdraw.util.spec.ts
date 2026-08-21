import { platformCommissionWithdrawError } from './platform-commission-withdraw.util';

describe('platformCommissionWithdrawError', () => {
  it('blocks amount above available commission', () => {
    expect(
      platformCommissionWithdrawError({
        amount: 5000,
        available: 1200,
        minAmount: 300,
      }),
    ).toMatch(/exceeds platform commission/i);
  });

  it('blocks below platform min (INR)', () => {
    expect(
      platformCommissionWithdrawError({
        amount: 100,
        available: 5000,
        minAmount: 300,
      }),
    ).toMatch(/Minimum withdrawal/);
  });

  it('allows USDT below INR min when funds exist', () => {
    expect(
      platformCommissionWithdrawError({
        amount: 10,
        available: 50,
        minAmount: 300,
        method: 'usdt',
      }),
    ).toBeNull();
  });

  it('allows amount within available', () => {
    expect(
      platformCommissionWithdrawError({
        amount: 1000,
        available: 1000,
        minAmount: 300,
      }),
    ).toBeNull();
  });
});
