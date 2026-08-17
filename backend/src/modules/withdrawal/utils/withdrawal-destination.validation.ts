import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

export type WithdrawalDestinationInput = {
  method: PaymentMethod | string;
  upiDetails?: { upiId?: string; payerName?: string };
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  usdtDetails?: { walletAddress?: string; network?: string };
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

/** UPI: no more than 9 consecutive digits */
export function validateUpiId(upiId: string): string | null {
  const v = upiId.trim();
  if (!v) return 'UPI ID is required';
  if (/\d{10,}/.test(v)) {
    return 'UPI ID cannot contain more than 9 consecutive digits';
  }
  return null;
}

/** IFSC: 4 letters + 0 + 6 alphanumeric */
export function validateIfsc(ifsc: string): string | null {
  const v = ifsc.trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) {
    return 'IFSC must be 11 characters: 4 letters, then 0, then 6 alphanumeric';
  }
  return null;
}

export function validateAccountNumber(accountNumber: string): string | null {
  const v = accountNumber.trim();
  if (!v) return 'Account number is required';
  if (!/^\d+$/.test(v)) return 'Account number must be numeric only';
  return null;
}

export function validateBankName(bankName: string): string | null {
  const v = bankName.trim();
  if (!v) return 'Bank name is required';
  return null;
}

/**
 * Throws BadRequestException when destination fields are invalid.
 * Used by WithdrawalService.create / validateDestination.
 */
export function assertValidWithdrawalDestination(dto: WithdrawalDestinationInput): void {
  switch (dto.method) {
    case PaymentMethod.UPI:
    case 'upi': {
      if (!dto.upiDetails?.upiId) throw new BadRequestException('UPI destination required');
      const upiErr = validateUpiId(dto.upiDetails.upiId);
      if (upiErr) throw new BadRequestException(upiErr);
      if (dto.upiDetails.payerName) {
        const nameErr = validatePersonName(dto.upiDetails.payerName, false);
        if (nameErr) throw new BadRequestException(nameErr);
      }
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
    default:
      throw new BadRequestException('Invalid withdrawal method');
  }
}
