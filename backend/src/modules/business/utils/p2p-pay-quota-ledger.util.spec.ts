import { p2pPayQuotaLedgerDescription } from './p2p-pay-quota-ledger.util';

describe('p2pPayQuotaLedgerDescription', () => {
  it('describes admin seed set', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'set',
        amount: 2000,
        seedBefore: 5000,
        seedAfter: 7000,
        remainingBefore: 1000,
        remainingAfter: 3000,
      }),
    ).toBe('P2P pay limit set ₹5000 → ₹7000. Remaining ₹1000 → ₹3000');
  });

  it('describes quota add', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'add',
        amount: 500,
        remainingBefore: 1000,
        remainingAfter: 1500,
      }),
    ).toBe('P2P pay limit added ₹500. Remaining ₹1000 → ₹1500');
  });

  it('describes user deposit earn', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'add',
        amount: 500,
        remainingBefore: 1000,
        remainingAfter: 1500,
        reason: 'user_deposit',
      }),
    ).toBe('P2P pay limit earned ₹500 (user deposit). Remaining ₹1000 → ₹1500');
  });

  it('describes cross-biz pay earn', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'add',
        amount: 5000,
        remainingBefore: 1000,
        remainingAfter: 6000,
        reason: 'user_pay_cross_biz',
      }),
    ).toBe(
      'P2P pay limit earned ₹5000 (user paid other business). Remaining ₹1000 → ₹6000',
    );
  });

  it('describes list reserve release', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'release',
        amount: 5000,
        remainingBefore: 1000,
        remainingAfter: 6000,
        reason: 'list_release',
      }),
    ).toBe(
      'P2P list reserve released ₹5000 (withdrawal paid). Remaining ₹1000 → ₹6000',
    );
  });

  it('describes list reserve', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'deduct',
        amount: 5000,
        remainingBefore: 10000,
        remainingAfter: 5000,
        reason: 'list_reserve',
      }),
    ).toBe('P2P list reserve ₹5000 (withdrawal listed). Remaining ₹10000 → ₹5000');
  });

  it('describes quota deduct', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'deduct',
        amount: 200,
        remainingBefore: 1500,
        remainingAfter: 1300,
      }),
    ).toBe('P2P pay limit deducted ₹200. Remaining ₹1500 → ₹1300');
  });

  it('notes admin fee on P2P payment limit deduct', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'deduct',
        amount: 50,
        remainingBefore: 1500,
        remainingAfter: 1450,
        feeToAdmin: true,
      }),
    ).toBe('P2P pay limit deducted ₹50 (fee to admin). Remaining ₹1500 → ₹1450');
  });

  it('notes withdrawal fee reason', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'deduct',
        amount: 50,
        remainingBefore: 1500,
        remainingAfter: 1450,
        reason: 'wd_fee',
      }),
    ).toBe(
      'P2P pay limit deducted ₹50 (withdrawal fee to admin). Remaining ₹1500 → ₹1450',
    );
  });

  it('notes deposit fee reason', () => {
    expect(
      p2pPayQuotaLedgerDescription({
        action: 'deduct',
        amount: 50,
        remainingBefore: 1500,
        remainingAfter: 1450,
        reason: 'deposit_fee',
      }),
    ).toBe(
      'P2P pay limit deducted ₹50 (deposit fee to admin). Remaining ₹1500 → ₹1450',
    );
  });
});
