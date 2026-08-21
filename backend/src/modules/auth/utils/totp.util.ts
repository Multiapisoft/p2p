import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function buildOtpauthUrl(opts: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer || 'PaySecure247';
  const label = encodeURIComponent(`${issuer}:${opts.email}`);
  const issuerEnc = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuerEnc}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotp(secret: string, atMs = Date.now()): string {
  return hotp(secret, Math.floor(atMs / 1000 / 30));
}

export function verifyTotp(
  secret: string,
  token: string,
  atMs = Date.now(),
  window = 1,
): boolean {
  const clean = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(atMs / 1000 / 30);
  const given = Buffer.from(clean);
  for (let i = -window; i <= window; i++) {
    const expected = Buffer.from(hotp(secret, counter + i));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return true;
    }
  }
  return false;
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
