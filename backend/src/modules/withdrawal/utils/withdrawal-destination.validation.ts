import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export type WithdrawalDestinationInput = {
  method: PaymentMethod | string;
  upiDetails?: {
    upiId?: string;
    payerName?: string;
    qrImageKey?: string;
    qrImageUrl?: string;
  };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string };
  cdmDetails?: { locationHint?: string; notes?: string; payerName?: string };
};

/** Name: alphabets + spaces only */
export function validatePersonName(name: string, required: boolean): string | null {
  const v = name.trim();
  if (!v) return required ? 'Name is required' : null;
  if (!/^[A-Za-z ]+$/.test(v)) {
    return 'Name must contain alphabets and spaces only (no numbers)';
  }
  return null;
}

/** 10-digit mobile number UPI, e.g. 9876543210@paytm */
export function isMobileNumberUpi(upiId: string): boolean {
  return /^\d{10}@[a-zA-Z0-9.\-]+$/.test(upiId.trim());
}

export type ValidateUpiOpts = { allowMobileNumber?: boolean };

/** UPI: no more than 9 consecutive digits, unless mobile-number UPI is enabled. */
export function validateUpiId(upiId: string, opts?: ValidateUpiOpts): string | null {
  const v = upiId.trim();
  if (!v) return 'UPI ID is required';
  if (opts?.allowMobileNumber && isMobileNumberUpi(v)) return null;
  if (/\d{10,}/.test(v)) {
    return 'UPI ID cannot contain more than 9 consecutive digits';
  }
  return null;
}

/** IFSC: 4 letters + 0 + 6 alphanumeric */
export function validateIfsc(ifsc: string): string | null {
  const v = ifsc.trim().toUpperCase();
  if (!v) return 'IFSC is required';
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

export function validateAccountNumber(accountNumber: string): string | null {
  const v = accountNumber.trim();
  if (!v) return 'Account number is required';
  if (!/^\d+$/.test(v)) return 'Account number must be numeric only';
  if (v.length < 9 || v.length > 18) {
    return 'Account number must be 9 to 18 digits';
  }
  return null;
}

export function validateBankName(bankName: string): string | null {
  const v = bankName.trim();
  if (!v) return 'Bank name is required';
  if (/\d/.test(v)) return 'Bank name must not contain numeric characters';
  return null;
}

/**
 * Throws BadRequestException when destination fields are invalid.
 * Used by WithdrawalService.create / validateDestination.
 */
export function assertValidWithdrawalDestination(
  dto: WithdrawalDestinationInput,
  opts?: ValidateUpiOpts,
): void {
  switch (dto.method) {
    case PaymentMethod.UPI:
    case 'upi': {
      const u = dto.upiDetails;
      const hasId = !!u?.upiId?.trim();
      const hasQr = !!(u?.qrImageUrl?.trim() || u?.qrImageKey?.trim());
      if (!hasId && !hasQr) {
        throw new BadRequestException('Enter UPI ID or upload scanner QR (not both empty)');
      }
      if (hasId && hasQr) {
        throw new BadRequestException('Use either UPI ID or scanner QR, not both');
      }
      if (hasId) {
        const upiErr = validateUpiId(u!.upiId!, opts);
        if (upiErr) throw new BadRequestException(upiErr);
      }
      const nameErr = validatePersonName(u?.payerName || '', true);
      if (nameErr) throw new BadRequestException(nameErr);
      break;
    }
    case PaymentMethod.BANK:
    case 'bank': {
      const b = dto.bankDetails;
      if (!b?.accountNumber || !b?.ifscCode || !b?.accountHolderName || !b?.bankName) {
        throw new BadRequestException(
          'Bank account, IFSC, account holder name and bank name are required',
        );
      }
      const acctErr = validateAccountNumber(b.accountNumber);
      if (acctErr) throw new BadRequestException(acctErr);
      const nameErr = validatePersonName(b.accountHolderName, true);
      if (nameErr) throw new BadRequestException(nameErr);
      const ifscErr = validateIfsc(b.ifscCode);
      if (ifscErr) throw new BadRequestException(ifscErr);
      const bankErr = validateBankName(b.bankName);
      if (bankErr) throw new BadRequestException(bankErr);
      break;
    }
    case PaymentMethod.USDT:
    case 'usdt':
      if (!dto.usdtDetails?.walletAddress) {
        throw new BadRequestException('USDT address required');
      }
      break;
    case PaymentMethod.CDM:
    case 'cdm': {
      const nameErr = validatePersonName(dto.cdmDetails?.payerName || '', true);
      if (nameErr) throw new BadRequestException(nameErr);
      break;
    }
    default:
      throw new BadRequestException('Invalid withdrawal method');
  }
}
