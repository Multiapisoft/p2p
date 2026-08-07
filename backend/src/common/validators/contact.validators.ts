import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  Matches,
  ValidationOptions,
  IsOptional,
  ValidateIf,
} from 'class-validator';

/** Indian mobile: 10 digits starting 6–9, optional +91 / 91 / 0 prefix */
export const PHONE_PATTERN = /^(\+91|91|0)?[6-9]\d{9}$/;

/**
 * Bank / UPI UTR or IMPS RRN:
 * - usually 12 digits
 * - some banks use 12–22 alphanumeric
 */
export const UTR_PATTERN = /^([0-9]{12}|[A-Z0-9]{12,22})$/;

/**
 * USDT / crypto TxID:
 * - TRON (TRC20): 64 hex chars
 * - ETH / BSC: optional 0x + 64 hex
 * After normalizeTxHash: `0x` + UPPER hex, or UPPER hex only
 */
export const TX_HASH_PATTERN = /^(0x)?[A-F0-9]{64}$/;

/** Either bank UTR or crypto TxID */
export const PAYMENT_REF_PATTERN =
  /^(([0-9]{12}|[A-Z0-9]{12,22})|(0x)?[A-F0-9]{64})$/;

export function normalizeEmail(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

export function normalizePhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]/.test(digits)) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]/.test(digits)) {
    return digits.slice(1);
  }
  return raw;
}

export function normalizeUtr(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim().toUpperCase().replace(/\s+/g, '');
  return t === '' ? undefined : t;
}

/** Keep hex + optional 0x; strip spaces/newlines from wallet explorers */
export function normalizeTxHash(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let t = value.trim().replace(/\s+/g, '');
  if (!t) return undefined;
  if (t.toLowerCase().startsWith('0x')) {
    t = `0x${t.slice(2)}`;
  }
  // Store hex portion uppercased; 0x prefix lowercase for consistency
  if (t.toLowerCase().startsWith('0x')) {
    return `0x${t.slice(2).toUpperCase()}`;
  }
  return t.toUpperCase();
}

export function isValidPhone(value: string): boolean {
  const n = normalizePhone(value);
  return typeof n === 'string' && PHONE_PATTERN.test(n);
}

export function isValidUtr(value: string): boolean {
  const n = normalizeUtr(value);
  return typeof n === 'string' && UTR_PATTERN.test(n);
}

export function isValidTxHash(value: string): boolean {
  const n = normalizeTxHash(value);
  return typeof n === 'string' && TX_HASH_PATTERN.test(n);
}

/** Validate payment reference for a known payout method */
export function isValidPaymentRefForMethod(
  value: string,
  method: 'upi' | 'bank' | 'usdt' | string,
): boolean {
  if (method === 'usdt') return isValidTxHash(value);
  return isValidUtr(value);
}

export function paymentRefErrorForMethod(
  value: string,
  method: 'upi' | 'bank' | 'usdt' | string,
): string | null {
  const v = value?.trim() ?? '';
  if (!v) {
    return method === 'usdt'
      ? 'USDT / TRX transaction hash (TxID) is required'
      : 'UTR is required';
  }
  if (method === 'usdt') {
    return isValidTxHash(v)
      ? null
      : 'Enter a valid USDT TxID — TRON/TRC20 is 64 hex characters (optional 0x prefix)';
  }
  return isValidUtr(v)
    ? null
    : 'Enter a valid UTR / RRN — usually 12 digits (or 12–22 letters/digits, no spaces)';
}

export function isValidPaymentRef(value: string): boolean {
  return isValidUtr(value) || isValidTxHash(value);
}

export function IsAppEmail(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizeEmail(value)),
    IsEmail(
      {},
      { message: 'Enter a valid email address', ...validationOptions },
    ),
  );
}

export function IsAppPhone(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizePhone(value)),
    Matches(PHONE_PATTERN, {
      message: 'Enter a valid 10-digit Indian mobile number',
      ...validationOptions,
    }),
  );
}

/** Optional phone — empty / whitespace becomes undefined */
export function IsOptionalAppPhone(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizePhone(value)),
    IsOptional(),
    ValidateIf((_, v) => v !== undefined && v !== null && v !== ''),
    Matches(PHONE_PATTERN, {
      message: 'Enter a valid 10-digit Indian mobile number',
      ...validationOptions,
    }),
  );
}

export function IsAppUtr(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizeUtr(value)),
    Matches(UTR_PATTERN, {
      message: 'UTR must be 12 digits, or 12–22 letters/digits (no spaces)',
      ...validationOptions,
    }),
  );
}

/** Required payment reference — bank UTR or USDT/TRX TxID */
export function IsAppPaymentRef(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => {
      if (typeof value !== 'string') return value;
      const raw = value.trim();
      if (!raw) return undefined;
      // Prefer tx-hash normalize when it looks like hex/0x
      if (/^(0x)?[a-fA-F0-9]{64}$/i.test(raw.replace(/\s+/g, ''))) {
        return normalizeTxHash(raw);
      }
      return normalizeUtr(raw);
    }),
    Matches(PAYMENT_REF_PATTERN, {
      message:
        'Enter a valid bank UTR (12–22 chars) or USDT/TRX TxID (64 hex characters)',
      ...validationOptions,
    }),
  );
}

export function IsOptionalAppUtr(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizeUtr(value)),
    IsOptional(),
    ValidateIf((_, v) => v !== undefined && v !== null && v !== ''),
    Matches(UTR_PATTERN, {
      message: 'UTR must be 12 digits, or 12–22 letters/digits (no spaces)',
      ...validationOptions,
    }),
  );
}

export function IsOptionalAppTxHash(validationOptions?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizeTxHash(value)),
    IsOptional(),
    ValidateIf((_, v) => v !== undefined && v !== null && v !== ''),
    Matches(TX_HASH_PATTERN, {
      message:
        'Enter a valid USDT / TRX TxID — 64 hex characters (optional 0x prefix)',
      ...validationOptions,
    }),
  );
}
