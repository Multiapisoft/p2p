import { escapeRegex } from './payment-ref-uniqueness.util';

describe('payment-ref-uniqueness (#9)', () => {
  it('escapes regex metacharacters in UTR', () => {
    expect(escapeRegex('ABC.123+xyz')).toBe('ABC\\.123\\+xyz');
  });
});
