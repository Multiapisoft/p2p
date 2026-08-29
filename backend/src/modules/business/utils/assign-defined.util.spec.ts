import { assignDefinedFields } from './assign-defined.util';

describe('assignDefinedFields', () => {
  it('skips undefined so required mongoose fields are not wiped', () => {
    const doc = { name: 'Acme', depositsEnabled: true };
    assignDefinedFields(doc, {
      name: undefined,
      depositsEnabled: false,
      allowPartialPay: true,
      allowedWithdrawalMethods: ['upi', 'bank'],
    });
    expect(doc).toEqual({
      name: 'Acme',
      depositsEnabled: false,
      allowPartialPay: true,
      allowedWithdrawalMethods: ['upi', 'bank'],
    });
  });
});
