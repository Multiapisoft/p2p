import {
  buildSavedWithdrawalMethodLabel,
  deleteSavedWithdrawalMethod,
  ensureSavedMethodDefault,
  upsertSavedWithdrawalMethod,
  type SavedWithdrawalMethodView,
} from './saved-withdrawal-methods.util';

describe('saved withdrawal methods utils', () => {
  const now = '2026-08-18T00:00:00.000Z';

  it('builds readable labels', () => {
    expect(
      buildSavedWithdrawalMethodLabel({
        method: 'upi',
        upiDetails: { upiId: 'demo@upi', payerName: 'Demo User' },
      }),
    ).toBe('UPI - demo@upi');
    expect(
      buildSavedWithdrawalMethodLabel({
        method: 'bank',
        bankDetails: {
          accountNumber: '123456789012',
          ifscCode: 'SBIN0000001',
          accountHolderName: 'Demo User',
          bankName: 'SBI',
        },
      }),
    ).toBe('Bank - XXXX9012');
  });

  it('ensures a default exists', () => {
    const out = ensureSavedMethodDefault([
      baseMethod('1', 'upi'),
      baseMethod('2', 'bank'),
    ]);
    expect(out[0]?.isDefault).toBe(true);
    expect(out[1]?.isDefault).toBe(false);
  });

  it('upserts and replaces previous default', () => {
    const existing = [baseMethod('1', 'upi', true), baseMethod('2', 'bank')];
    const out = upsertSavedWithdrawalMethod(
      existing,
      {
        label: 'USDT - TRC20',
        method: 'usdt',
        isDefault: true,
        usdtDetails: { walletAddress: 'wallet', network: 'TRC20' },
      },
      now,
    );
    expect(out).not.toBeNull();
    expect(out?.some((m) => m.method === 'usdt' && m.isDefault)).toBe(true);
    expect(out?.filter((m) => m.isDefault)).toHaveLength(1);
  });

  it('deletes and promotes the next default', () => {
    const out = deleteSavedWithdrawalMethod(
      [baseMethod('1', 'upi', true), baseMethod('2', 'bank')],
      '1',
    );
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    expect(out?.[0]?.isDefault).toBe(true);
  });

  it('stores multiple methods with a single default', () => {
    const first = upsertSavedWithdrawalMethod(
      [],
      {
        label: 'UPI - demo@upi',
        method: 'upi',
        isDefault: true,
        upiDetails: { upiId: 'demo@upi', payerName: 'Demo User' },
      },
      now,
    );
    const second = upsertSavedWithdrawalMethod(
      first || [],
      {
        label: 'Bank - XXXX9012',
        method: 'bank',
        isDefault: false,
        bankDetails: {
          accountNumber: '123456789012',
          ifscCode: 'SBIN0000001',
          accountHolderName: 'Demo User',
          bankName: 'SBI',
        },
      },
      now,
    );
    expect(second).toHaveLength(2);
    expect(second?.filter((m) => m.isDefault)).toHaveLength(1);
    expect(second?.find((m) => m.method === 'upi')?.isDefault).toBe(true);
  });
});

function baseMethod(
  id: string,
  method: SavedWithdrawalMethodView['method'],
  isDefault = false,
): SavedWithdrawalMethodView {
  return {
    _id: id,
    label: method.toUpperCase(),
    method,
    isDefault,
    createdAt: nowIso(id),
    updatedAt: nowIso(id),
    upiDetails: method === 'upi' ? { upiId: 'demo@upi', payerName: 'Demo User' } : undefined,
    bankDetails:
      method === 'bank'
        ? {
            accountNumber: '123456789012',
            ifscCode: 'SBIN0000001',
            accountHolderName: 'Demo User',
            bankName: 'SBI',
          }
        : undefined,
    usdtDetails: method === 'usdt' ? { walletAddress: 'wallet', network: 'TRC20' } : undefined,
  };
}

function nowIso(seed: string) {
  return `2026-08-18T00:00:0${seed}.000Z`;
}
