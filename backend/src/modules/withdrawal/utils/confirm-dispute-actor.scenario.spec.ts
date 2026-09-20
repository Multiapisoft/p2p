/**
 * Complex scenarios for confirm-received / dispute — mirrors
 * WithdrawalPaymentService.assertCanActAsWithdrawer + confirmReceived + raiseDispute
 * decision gates (pure, no Mongo).
 */

function canActAsWithdrawer(opts: {
  withdrawalUserId: string;
  withdrawalOrigin?: string | null;
  withdrawalBusinessId?: string | null;
  actorUserId: string;
  actorBusinessId?: string | null;
}): boolean {
  if (opts.withdrawalUserId === opts.actorUserId) return true;
  if (
    opts.withdrawalOrigin === 'business' &&
    opts.withdrawalBusinessId &&
    opts.actorBusinessId &&
    opts.withdrawalBusinessId === opts.actorBusinessId
  ) {
    return true;
  }
  return false;
}

type Gate = { ok: true } | { ok: false; reason: string };

function confirmReceivedGate(opts: {
  paymentStatus: string;
  disputedAt?: Date | null;
  canAct: boolean;
}): Gate {
  if (opts.paymentStatus !== 'pending') {
    return { ok: false, reason: 'Payment is not pending' };
  }
  if (opts.disputedAt) {
    return { ok: false, reason: 'Payment is under dispute' };
  }
  if (!opts.canAct) {
    return {
      ok: false,
      reason:
        'Only the withdrawal owner (or owning business) can confirm or dispute this payment',
    };
  }
  return { ok: true };
}

function raiseDisputeGate(opts: {
  paymentStatus: string;
  disputedAt?: Date | null;
  canAct: boolean;
  nowMs: number;
  windowEndMs: number | null;
}): Gate {
  if (opts.paymentStatus !== 'pending') {
    return {
      ok: false,
      reason:
        opts.paymentStatus === 'completed'
          ? 'Payment already confirmed received — cannot dispute'
          : `Only pending payments can be disputed (current: ${opts.paymentStatus})`,
    };
  }
  if (opts.disputedAt) {
    return { ok: false, reason: 'Dispute already raised for this payment' };
  }
  if (!opts.canAct) {
    return {
      ok: false,
      reason:
        'Only the withdrawal owner (or owning business) can confirm or dispute this payment',
    };
  }
  if (opts.windowEndMs == null || opts.nowMs > opts.windowEndMs) {
    return {
      ok: false,
      reason:
        'Dispute window expired (24 hours from payment submit). Payment will auto-receive.',
    };
  }
  return { ok: true };
}

describe('confirm / dispute actor gates — complex scenarios', () => {
  const USER = 'user-owner';
  const BIZ_OWNER = 'biz-portal-user';
  const BIZ_A = 'biz-a';
  const BIZ_B = 'biz-b';
  const INVESTOR = 'investor-payer';
  const now = Date.parse('2026-09-21T10:00:00.000Z');
  const windowEnd = now + 24 * 60 * 60 * 1000;

  describe('who may confirm/dispute', () => {
    it('user WD: only the withdrawer user can confirm', () => {
      expect(
        canActAsWithdrawer({
          withdrawalUserId: USER,
          withdrawalOrigin: 'user',
          actorUserId: USER,
        }),
      ).toBe(true);
      expect(
        canActAsWithdrawer({
          withdrawalUserId: USER,
          withdrawalOrigin: 'user',
          actorUserId: INVESTOR,
        }),
      ).toBe(false);
      expect(
        canActAsWithdrawer({
          withdrawalUserId: USER,
          withdrawalOrigin: 'user',
          withdrawalBusinessId: BIZ_A,
          actorUserId: BIZ_OWNER,
          actorBusinessId: BIZ_A,
        }),
      ).toBe(false);
    });

    it('business WD: owning business portal can confirm like the user', () => {
      expect(
        canActAsWithdrawer({
          withdrawalUserId: BIZ_OWNER,
          withdrawalOrigin: 'business',
          withdrawalBusinessId: BIZ_A,
          actorUserId: BIZ_OWNER,
          actorBusinessId: BIZ_A,
        }),
      ).toBe(true);
      // Different business portal must be blocked
      expect(
        canActAsWithdrawer({
          withdrawalUserId: BIZ_OWNER,
          withdrawalOrigin: 'business',
          withdrawalBusinessId: BIZ_A,
          actorUserId: 'other-biz',
          actorBusinessId: BIZ_B,
        }),
      ).toBe(false);
    });
  });

  describe('confirmReceived happy + failure paths', () => {
    it('allows pending undisputed payment for withdrawer', () => {
      const canAct = canActAsWithdrawer({
        withdrawalUserId: USER,
        actorUserId: USER,
      });
      expect(confirmReceivedGate({ paymentStatus: 'pending', canAct })).toEqual({
        ok: true,
      });
    });

    it('blocks confirm when already disputed', () => {
      const g = confirmReceivedGate({
        paymentStatus: 'pending',
        disputedAt: new Date(now),
        canAct: true,
      });
      expect(g.ok).toBe(false);
      if (!g.ok) expect(g.reason).toContain('dispute');
    });

    it('blocks confirm when payment already completed', () => {
      const g = confirmReceivedGate({
        paymentStatus: 'completed',
        canAct: true,
      });
      expect(g).toEqual({ ok: false, reason: 'Payment is not pending' });
    });

    it('business portal confirms business-origin WD payment', () => {
      const canAct = canActAsWithdrawer({
        withdrawalUserId: BIZ_OWNER,
        withdrawalOrigin: 'business',
        withdrawalBusinessId: BIZ_A,
        actorUserId: BIZ_OWNER,
        actorBusinessId: BIZ_A,
      });
      expect(
        confirmReceivedGate({ paymentStatus: 'pending', canAct }),
      ).toEqual({ ok: true });
    });
  });

  describe('dispute uploads within 24h window', () => {
    it('allows dispute inside window for owner', () => {
      expect(
        raiseDisputeGate({
          paymentStatus: 'pending',
          canAct: true,
          nowMs: now,
          windowEndMs: windowEnd,
        }),
      ).toEqual({ ok: true });
    });

    it('blocks dispute after 24h (auto-receive path)', () => {
      const g = raiseDisputeGate({
        paymentStatus: 'pending',
        canAct: true,
        nowMs: windowEnd + 1,
        windowEndMs: windowEnd,
      });
      expect(g.ok).toBe(false);
      if (!g.ok) expect(g.reason).toContain('Dispute window expired');
    });

    it('blocks double dispute and completed payments', () => {
      expect(
        raiseDisputeGate({
          paymentStatus: 'pending',
          disputedAt: new Date(now),
          canAct: true,
          nowMs: now,
          windowEndMs: windowEnd,
        }).ok,
      ).toBe(false);
      const completed = raiseDisputeGate({
        paymentStatus: 'completed',
        canAct: true,
        nowMs: now,
        windowEndMs: windowEnd,
      });
      expect(completed.ok).toBe(false);
      if (!completed.ok) {
        expect(completed.reason).toContain('already confirmed received');
      }
    });

    it('investor/payer cannot dispute someone else’s WD payment', () => {
      const canAct = canActAsWithdrawer({
        withdrawalUserId: USER,
        actorUserId: INVESTOR,
      });
      const g = raiseDisputeGate({
        paymentStatus: 'pending',
        canAct,
        nowMs: now,
        windowEndMs: windowEnd,
      });
      expect(g.ok).toBe(false);
      if (!g.ok) expect(g.reason).toContain('Only the withdrawal owner');
    });
  });
});
