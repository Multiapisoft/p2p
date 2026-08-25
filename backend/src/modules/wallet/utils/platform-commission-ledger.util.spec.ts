import { Currency } from '../../../common/enums/currency.enum';
import {
  businessFeeInDescription,
  feeCutNote,
  investorCommissionInDescription,
  investorCommissionOutDescription,
  partyLabel,
  platformFeeInDescription,
  depositGivenToDescription,
  stripFeeCutFromDescription,
} from './platform-commission-ledger.util';

describe('platform-commission-ledger.util', () => {
  it('describes platform fee received from a payer', () => {
    const text = platformFeeInDescription({
      amount: 10,
      currency: Currency.INR,
      fromName: 'Rahul (user)',
      referenceLabel: 'PAY-1',
    });
    expect(text).toBe('Platform fee ₹10 received from Rahul (user) (PAY-1)');
  });

  it('describes investor commission leaving admin wallet', () => {
    const text = investorCommissionOutDescription({
      amount: 25.5,
      currency: Currency.INR,
      toName: 'Anita (investor)',
      referenceLabel: 'PAY-9',
    });
    expect(text).toBe(
      'Investor commission ₹25.5 paid to Anita (investor) (PAY-9)',
    );
  });

  it('describes investor bonus credited without fee-split wording', () => {
    const text = investorCommissionInDescription({
      amount: 25.5,
      referenceLabel: 'PAY-9',
    });
    expect(text).toBe('Bonus ₹25.5 credited (PAY-9)');
    expect(text.toLowerCase()).not.toContain('fee');
    expect(text.toLowerCase()).not.toContain('platform');
  });

  it('labels parties with role', () => {
    expect(partyLabel('Admin One', 'admin')).toBe('Admin One (admin)');
    expect(partyLabel('  ', 'user')).toBe('Unknown (user)');
  });

  it('describes business fee received from a payer', () => {
    const text = businessFeeInDescription({
      amount: 8,
      currency: Currency.INR,
      fromName: 'Rahul (user)',
      referenceLabel: 'DEP-1',
    });
    expect(text).toBe('Business fee ₹8 received from Rahul (user) (DEP-1)');
  });

  it('describes deposit given to a user', () => {
    const text = depositGivenToDescription({
      amount: 2000,
      currency: Currency.INR,
      toName: 'Rahul (user)',
      referenceLabel: 'WDR-1',
    });
    expect(text).toBe('Deposit given to Rahul (user) ₹2000 (WDR-1)');
  });

  it('describes fee cut notes', () => {
    expect(feeCutNote(0, 0)).toBe('');
    expect(feeCutNote(10, 0)).toBe(' Fee cut: platform fee ₹10.');
    expect(feeCutNote(0, 5)).toBe(' Fee cut: business fee ₹5.');
    expect(feeCutNote(10, 5)).toBe(' Fee cut: platform fee ₹10 + business fee ₹5.');
  });

  it('strips fee cut notes from payer ledger descriptions', () => {
    expect(
      stripFeeCutFromDescription(
        'Deposit approved by admin Fee cut: platform fee ₹10 + business fee ₹5.',
      ),
    ).toBe('Deposit approved by admin');
    expect(stripFeeCutFromDescription('P2P payment — WDR-1')).toBe('P2P payment — WDR-1');
  });
});
