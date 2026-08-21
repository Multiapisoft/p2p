import {
  buildOtpauthUrl,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from './totp.util';

describe('totp.util (RFC 6238 TOTP)', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const at = Date.parse('2026-08-18T04:30:00.000Z');

  it('generates a base32 secret', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });

  it('builds an otpauth URL', () => {
    const url = buildOtpauthUrl({
      secret: 'ABCDEF',
      email: 'owner@example.com',
      issuer: 'PaySecure247',
    });
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('secret=ABCDEF');
    expect(url).toContain('issuer=PaySecure247');
  });

  it('accepts the current 6-digit code', () => {
    const code = generateTotp(secret, at);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, at, 0)).toBe(true);
  });

  it('accepts codes within ±1 window', () => {
    const prev = generateTotp(secret, at - 30_000);
    const next = generateTotp(secret, at + 30_000);
    expect(verifyTotp(secret, prev, at, 1)).toBe(true);
    expect(verifyTotp(secret, next, at, 1)).toBe(true);
  });

  it('rejects wrong / empty / non-6-digit codes', () => {
    expect(verifyTotp(secret, '000000', at, 1)).toBe(false);
    expect(verifyTotp(secret, '', at, 1)).toBe(false);
    expect(verifyTotp(secret, '12345', at, 1)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', at, 1)).toBe(false);
  });

  it('rejects a code outside the window', () => {
    const old = generateTotp(secret, at - 120_000);
    expect(verifyTotp(secret, old, at, 1)).toBe(false);
  });
});
