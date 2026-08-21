import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import {
  assertValidWithdrawalDestination,
  validateAccountNumber,
  validateBankName,
  validateIfsc,
  validatePersonName,
  validateUpiId,
} from './withdrawal-destination.validation';

describe('withdrawal-destination.validation (#15)', () => {
  describe('validatePersonName', () => {
    it('allows alphabets and spaces', () => {
      expect(validatePersonName('Shaifali Kumar', true)).toBeNull();
    });
    it('rejects numbers in name', () => {
      expect(validatePersonName('Raju123', true)).toMatch(/alphabets/);
    });
    it('requires name when required=true', () => {
      expect(validatePersonName('  ', true)).toBe('Name is required');
    });
    it('allows empty when required=false', () => {
      expect(validatePersonName('', false)).toBeNull();
    });
  });

  describe('validateUpiId', () => {
    it('accepts normal UPI', () => {
      expect(validateUpiId('user@okaxis')).toBeNull();
    });
    it('rejects 10+ consecutive digits when mobile UPI is off', () => {
      expect(validateUpiId('9876543210@paytm')).toMatch(/9 consecutive/);
      expect(validateUpiId('9876543210@paytm', { allowMobileNumber: false })).toMatch(
        /9 consecutive/,
      );
    });
    it('allows 10-digit mobile UPI when toggle is on', () => {
      expect(validateUpiId('9876543210@paytm', { allowMobileNumber: true })).toBeNull();
    });
    it('still rejects 11+ digits even when mobile UPI is on', () => {
      expect(validateUpiId('98765432101@paytm', { allowMobileNumber: true })).toMatch(
        /9 consecutive/,
      );
    });
    it('allows up to 9 consecutive digits', () => {
      expect(validateUpiId('987654321@ybl')).toBeNull();
    });
  });

  describe('validateAccountNumber / IFSC / bank', () => {
    it('account must be numeric', () => {
      expect(validateAccountNumber('53452637489')).toBeNull();
      expect(validateAccountNumber('AB123')).toMatch(/numeric/);
    });
    it('account must be 9 to 18 digits', () => {
      expect(validateAccountNumber('12345678')).toMatch(/9 to 18/);
      expect(validateAccountNumber('1234567890123456789')).toMatch(/9 to 18/);
      expect(validateAccountNumber('123456789')).toBeNull();
      expect(validateAccountNumber('123456789012345678')).toBeNull();
    });
    it('IFSC pattern AAAA0XXXXXX', () => {
      expect(validateIfsc('SBIN0001234')).toBeNull();
      expect(validateIfsc('sbin0001234')).toBeNull();
      expect(validateIfsc('SBIN1001234')).toMatch(/5th character must be zero/);
      expect(validateIfsc('SBIN001')).toMatch(/exactly 11/);
    });
    it('bank name required and non-numeric', () => {
      expect(validateBankName('SBI')).toBeNull();
      expect(validateBankName('  ')).toBe('Bank name is required');
      expect(validateBankName('HDFC2')).toMatch(/numeric/);
    });
  });

  describe('assertValidWithdrawalDestination', () => {
    it('accepts valid bank destination', () => {
      expect(() =>
        assertValidWithdrawalDestination({
          method: PaymentMethod.BANK,
          bankDetails: {
            accountNumber: '1234567890',
            ifscCode: 'HDFC0001234',
            accountHolderName: 'Demo User',
            bankName: 'HDFC Bank',
          },
        }),
      ).not.toThrow();
    });

    it('rejects bank without bankName', () => {
      expect(() =>
        assertValidWithdrawalDestination({
          method: PaymentMethod.BANK,
          bankDetails: {
            accountNumber: '1234567890',
            ifscCode: 'HDFC0001234',
            accountHolderName: 'Demo User',
          },
        }),
      ).toThrow(BadRequestException);
    });

    it('requires UPI name', () => {
      expect(() =>
        assertValidWithdrawalDestination({
          method: PaymentMethod.UPI,
          upiDetails: { upiId: 'abc@okaxis' },
        }),
      ).toThrow(/Name is required/);
    });

    it('requires UPI account name', () => {
      expect(() =>
        assertValidWithdrawalDestination({
          method: PaymentMethod.UPI,
          upiDetails: { upiId: 'abc@okaxis', payerName: '' },
        }),
      ).toThrow(/name/i);
    });

    it('accepts valid UPI', () => {
      expect(() =>
        assertValidWithdrawalDestination({
          method: PaymentMethod.UPI,
          upiDetails: { upiId: 'abc@okaxis', payerName: 'Demo User' },
        }),
      ).not.toThrow();
    });

    it('rejects mobile UPI destination unless allowMobileNumber', () => {
      expect(() =>
        assertValidWithdrawalDestination({
          method: PaymentMethod.UPI,
          upiDetails: { upiId: '9876543210@paytm', payerName: 'Demo User' },
        }),
      ).toThrow(/9 consecutive/);
      expect(() =>
        assertValidWithdrawalDestination(
          {
            method: PaymentMethod.UPI,
            upiDetails: { upiId: '9876543210@paytm', payerName: 'Demo User' },
          },
          { allowMobileNumber: true },
        ),
      ).not.toThrow();
    });

    it('rejects USDT without wallet', () => {
      expect(() =>
        assertValidWithdrawalDestination({
          method: PaymentMethod.USDT,
          usdtDetails: {},
        }),
      ).toThrow(/USDT address/);
    });
  });
});
