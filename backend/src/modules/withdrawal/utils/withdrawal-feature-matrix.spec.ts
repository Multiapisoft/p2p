import {
  availableForPaymentBaseFilter,
  isWithinUserEditTat,
  userCanCancelWithdrawal,
} from './withdrawal-visibility.util';

/**
 * End-to-end style matrix (pure rules) — who sees / can act on a withdrawal.
 * Covers user, investor (payer), business, admin for new Noida features.
 */
describe('Withdrawal feature matrix — visibility & actions', () => {
  const tatMs = 120_000;
  const now = Date.parse('2026-08-17T12:00:00.000Z');

  type RoleView = {
    role: 'owner-user' | 'same-biz-user' | 'other-biz-user' | 'investor' | 'business' | 'admin';
    canSeeInOwnList: boolean;
    canSeeInPayList: boolean;
    canCancel: boolean;
    canListForPlatformPayment: boolean;
  };

  function scenario(label: string, wd: {
    status: string;
    p2pListStatus?: string;
    paidAmount?: number;
    businessId?: string | null;
    createdAt: Date;
    listed: boolean;
  }, expectations: RoleView[]) {
    it(label, () => {
      const withinTat = isWithinUserEditTat(wd.createdAt, now, tatMs);
      const listed = wd.p2pListStatus === 'listed' || wd.listed;

      for (const exp of expectations) {
        const canCancel =
          exp.role === 'owner-user'
            ? userCanCancelWithdrawal({
                status: wd.status,
                p2pListStatus: wd.p2pListStatus,
                paidAmount: wd.paidAmount,
                createdAt: wd.createdAt,
                nowMs: now,
                tatMs,
              })
            : false;

        // Pay list: investors/users only see listed + not own
        const payFilter = availableForPaymentBaseFilter('owner-id');
        const canSeeInPayList =
          (exp.role === 'investor' ||
            exp.role === 'same-biz-user' ||
            exp.role === 'other-biz-user') &&
          payFilter.p2pListStatus === 'listed' &&
          listed &&
          (wd.status === 'pending' || wd.status === 'processing');

        // Business sees only after TAT
        const businessSees = exp.role === 'business' && !withinTat;
        // Admin sees after listed (or terminal) — here we model listed case
        const adminSees =
          exp.role === 'admin' && (listed || ['completed', 'rejected', 'cancelled'].includes(wd.status));
        // Owner always sees own list
        const ownerSees = exp.role === 'owner-user';

        const canSeeInOwnList =
          ownerSees ||
          (exp.role === 'business' && businessSees) ||
          (exp.role === 'admin' && adminSees);

        const canListForPlatformPayment =
          exp.role === 'business' && !withinTat && !listed && wd.status === 'pending';

        expect({
          role: exp.role,
          canSeeInOwnList,
          canSeeInPayList,
          canCancel,
          canListForPlatformPayment,
        }).toEqual(exp);
      }
    });
  }

  scenario(
    'A) Fresh business-user WD inside TAT — only owner sees; nobody can pay yet',
    {
      status: 'pending',
      p2pListStatus: 'awaiting',
      paidAmount: 0,
      businessId: 'biz-1',
      createdAt: new Date(now - 30_000),
      listed: false,
    },
    [
      {
        role: 'owner-user',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: true,
        canListForPlatformPayment: false,
      },
      {
        role: 'business',
        canSeeInOwnList: false,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'admin',
        canSeeInOwnList: false,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'investor',
        canSeeInOwnList: false,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'same-biz-user',
        canSeeInOwnList: false,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
    ],
  );

  scenario(
    'B) After TAT, not listed — business can see & list; investors still cannot pay',
    {
      status: 'pending',
      p2pListStatus: 'awaiting',
      paidAmount: 0,
      businessId: 'biz-1',
      createdAt: new Date(now - tatMs - 5_000),
      listed: false,
    },
    [
      {
        role: 'owner-user',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'business',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: true,
      },
      {
        role: 'admin',
        canSeeInOwnList: false,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'investor',
        canSeeInOwnList: false,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
    ],
  );

  scenario(
    'C) Business listed for Platform Payment — admin + investor/user payers see it',
    {
      status: 'pending',
      p2pListStatus: 'listed',
      paidAmount: 0,
      businessId: 'biz-1',
      createdAt: new Date(now - tatMs - 60_000),
      listed: true,
    },
    [
      {
        role: 'owner-user',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'business',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'admin',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'investor',
        canSeeInOwnList: false,
        canSeeInPayList: true,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'same-biz-user',
        canSeeInOwnList: false,
        canSeeInPayList: true,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'other-biz-user',
        canSeeInOwnList: false,
        canSeeInPayList: true,
        canCancel: false,
        canListForPlatformPayment: false,
      },
    ],
  );

  scenario(
    'D) Completed WD — pay list closed; admin/business still see history',
    {
      status: 'completed',
      p2pListStatus: 'listed',
      paidAmount: 1000,
      businessId: 'biz-1',
      createdAt: new Date(now - 3600_000),
      listed: true,
    },
    [
      {
        role: 'owner-user',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'business',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'admin',
        canSeeInOwnList: true,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
      {
        role: 'investor',
        canSeeInOwnList: false,
        canSeeInPayList: false,
        canCancel: false,
        canListForPlatformPayment: false,
      },
    ],
  );
});
