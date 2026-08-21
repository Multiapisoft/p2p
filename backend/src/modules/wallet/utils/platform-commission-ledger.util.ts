import { Currency } from '../../../common/enums/currency.enum';

export function moneyLabel(amount: number, currency: Currency | string = Currency.INR): string {
  const cur = (currency || Currency.INR).toUpperCase();
  if (cur === Currency.INR) return `₹${amount}`;
  return `${amount} ${cur}`;
}

export function platformFeeInDescription(params: {
  amount: number;
  currency?: Currency | string;
  fromName: string;
  referenceLabel: string;
}): string {
  return `Platform fee ${moneyLabel(params.amount, params.currency)} received from ${params.fromName} (${params.referenceLabel})`;
}

export function businessFeeInDescription(params: {
  amount: number;
  currency?: Currency | string;
  fromName: string;
  referenceLabel: string;
}): string {
  return `Business fee ${moneyLabel(params.amount, params.currency)} received from ${params.fromName} (${params.referenceLabel})`;
}

export function feeCutNote(
  platformAmount: number,
  businessAmount: number,
  currency?: Currency | string,
): string {
  const parts: string[] = [];
  if (platformAmount > 0) {
    parts.push(`platform fee ${moneyLabel(platformAmount, currency)}`);
  }
  if (businessAmount > 0) {
    parts.push(`business fee ${moneyLabel(businessAmount, currency)}`);
  }
  if (!parts.length) return '';
  return ` Fee cut: ${parts.join(' + ')}.`;
}

export function investorCommissionOutDescription(params: {
  amount: number;
  currency?: Currency | string;
  toName: string;
  referenceLabel: string;
}): string {
  return `Investor commission ${moneyLabel(params.amount, params.currency)} paid to ${params.toName} (${params.referenceLabel})`;
}

export function investorCommissionInDescription(params: {
  amount: number;
  currency?: Currency | string;
  referenceLabel: string;
}): string {
  return `Investor commission ${moneyLabel(params.amount, params.currency)} received from platform (${params.referenceLabel})`;
}

export function depositGivenToDescription(params: {
  amount: number;
  currency?: Currency | string;
  toName: string;
  referenceLabel: string;
}): string {
  return `Deposit given to ${params.toName} ${moneyLabel(params.amount, params.currency)} (${params.referenceLabel})`;
}

export function partyLabel(name?: string, role?: string): string {
  const n = name?.trim() || 'Unknown';
  return role ? `${n} (${role})` : n;
}
