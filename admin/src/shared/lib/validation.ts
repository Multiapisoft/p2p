/** Shared client-side validation (email, Indian mobile, UTR / USDT-TRX TxID). */

export const PHONE_PATTERN = /^(\+91|91|0)?[6-9]\d{9}$/;

/** Bank/UPI UTR or IMPS RRN — 12 digits, or 12–22 alphanumeric */
export const UTR_PATTERN = /^([0-9]{12}|[A-Z0-9]{12,22})$/;

/** TRON TRC20 / ETH / BSC TxID — optional 0x + exactly 64 hex (after normalize) */
export const TX_HASH_PATTERN = /^(0x)?[A-F0-9]{64}$/;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const digits = value.trim().replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function normalizeUtr(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeTxHash(value: string): string {
  let t = value.trim().replace(/\s+/g, '');
  if (!t) return '';
  if (t.toLowerCase().startsWith('0x')) {
    return `0x${t.slice(2).toUpperCase()}`;
  }
  return t.toUpperCase();
}

export function isValidEmail(value: string): boolean {
  const v = normalizeEmail(value);
  return v.length > 3 && v.length <= 254 && EMAIL_PATTERN.test(v);
}

export function isValidPhone(value: string): boolean {
  const n = normalizePhone(value);
  return n.length === 10 && /^[6-9]\d{9}$/.test(n);
}

export function isValidUtr(value: string): boolean {
  return UTR_PATTERN.test(normalizeUtr(value));
}

export function isValidTxHash(value: string): boolean {
  const n = normalizeTxHash(value);
  return Boolean(n) && TX_HASH_PATTERN.test(n);
}

export function isValidPaymentRef(value: string): boolean {
  return isValidUtr(value) || isValidTxHash(value);
}

export function isValidPaymentRefForMethod(
  value: string,
  method: 'upi' | 'bank' | 'usdt' | string,
): boolean {
  if (method === 'usdt') return isValidTxHash(value);
  return isValidUtr(value);
}

export function emailError(value: string, required = true): string | null {
  const v = value.trim();
  if (!v) return required ? 'Email is required' : null;
  return isValidEmail(v) ? null : 'Enter a valid email address';
}

export function phoneError(value: string, required = false): string | null {
  const v = value.trim();
  if (!v) return required ? 'Mobile number is required' : null;
  return isValidPhone(v) ? null : 'Enter a valid 10-digit Indian mobile number';
}

export function utrError(value: string, required = true): string | null {
  const v = value.trim();
  if (!v) return required ? 'UTR is required' : null;
  return isValidUtr(v)
    ? null
    : 'Enter a valid UTR / RRN — usually 12 digits (or 12–22 letters/digits, no spaces)';
}

export function txHashError(value: string, required = false): string | null {
  const v = value.trim();
  if (!v) return required ? 'USDT / TRX TxID is required' : null;
  return isValidTxHash(v)
    ? null
    : 'Enter a valid USDT TxID — TRON/TRC20 is 64 hex characters (optional 0x prefix)';
}

export function paymentRefError(
  value: string,
  required = true,
  kind: 'utr' | 'txid' | 'auto' = 'auto',
): string | null {
  const v = value.trim();
  if (!v) {
    if (!required) return null;
    return kind === 'txid' ? 'USDT / TRX TxID is required' : 'UTR is required';
  }
  if (kind === 'utr') return utrError(v, true);
  if (kind === 'txid') return txHashError(v, true);
  if (isValidPaymentRef(v)) return null;
  return 'Enter a valid bank UTR (12–22 chars) or USDT/TRX TxID (64 hex)';
}

export function paymentRefErrorForMethod(
  value: string,
  method: 'upi' | 'bank' | 'usdt' | string,
  required = true,
): string | null {
  const v = value.trim();
  if (!v) {
    if (!required) return null;
    return method === 'usdt' ? 'USDT / TRX TxID is required' : 'UTR is required';
  }
  if (method === 'usdt') return txHashError(v, true);
  return utrError(v, true);
}

/** Name: alphabets + spaces only */
export function personNameError(value: string, required = true): string | null {
  const v = value.trim();
  if (!v) return required ? 'Name of Account Holder is required' : null;
  if (!/^[A-Za-z ]+$/.test(v)) {
    return 'Name of Account Holder must contain letters and spaces only (no numbers)';
  }
  return null;
}

/** UPI: no more than 9 consecutive digits unless mobile-number UPI is allowed */
export function upiIdError(
  value: string,
  required = true,
  opts?: { allowMobileNumber?: boolean },
): string | null {
  const v = value.trim();
  if (!v) return required ? 'UPI ID is required' : null;
  if (opts?.allowMobileNumber && /^\d{10}@[a-zA-Z0-9.\-]+$/.test(v)) return null;
  if (/\d{10,}/.test(v)) {
    return 'UPI ID cannot contain more than 9 consecutive digits';
  }
  return null;
}

export const ACCOUNT_NUMBER_MAX_LEN = 18;

export function sanitizeAccountNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, ACCOUNT_NUMBER_MAX_LEN);
}

export function accountNumberError(value: string, required = true): string | null {
  const v = value.trim();
  if (!v) return required ? 'Account number is required' : null;
  if (!/^\d+$/.test(v)) return 'Account number must be numeric only';
  if (v.length < 9 || v.length > ACCOUNT_NUMBER_MAX_LEN) {
    return 'Account number must be 9 to 18 digits';
  }
  return null;
}

export function ifscError(value: string, required = true): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return required ? 'IFSC is required' : null;
  if (v.length !== 11) {
    return 'IFSC must be exactly 11 characters (e.g. SBIN0001234)';
  }
  if (!/^[A-Z]{4}/.test(v)) {
    return 'IFSC first 4 characters must be letters';
  }
  if (v[4] !== '0') {
    return 'IFSC 5th character must be zero (0), e.g. SBIN0001234';
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) {
    return 'IFSC must be 11 characters: 4 letters, then 0, then 6 alphanumeric';
  }
  return null;
}

export function bankNameError(value: string, required = true): string | null {
  const v = value.trim();
  if (!v) return required ? 'Bank name is required' : null;
  if (/\d/.test(v)) return 'Bank name must not contain numeric characters';
  return null;
}
