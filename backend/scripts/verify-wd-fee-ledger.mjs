import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const ref = process.argv[2] || 'WDR-1790249160632-DEDA98EF';

const wd = await db.collection('withdrawals').findOne({ referenceId: ref });
const biz = await db.collection('businesses').findOne({ _id: wd.businessId });
const admin = await db.collection('users').findOne({ role: 'admin' });
const ownerId = biz.ownerId;

const pays = await db
  .collection('withdrawal_payments')
  .find({ withdrawalId: wd._id })
  .project({ referenceId: 1, amount: 1, status: 1 })
  .toArray();
const payIds = pays.map((p) => String(p._id));

const all = await db
  .collection('ledger_entries')
  .find({
    $or: [
      { referenceId: String(wd._id) },
      { referenceId: { $in: payIds } },
      { description: new RegExp(ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) },
      ...pays.map((p) => ({
        description: new RegExp(String(p.referenceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      })),
    ],
  })
  .sort({ createdAt: 1 })
  .toArray();

const roleOf = (uid) => {
  const s = String(uid);
  if (s === String(admin._id)) return 'admin';
  if (s === String(ownerId)) return 'bdg';
  return s.slice(-6);
};

const HIDDEN_OUT = new Set([
  'withdrawal_payment',
  'business_withdrawal',
  'withdrawal',
  'withdrawal_list_fee',
  'wd_fee_settle',
]);

const rows = all.map((e) => ({
  who: roleOf(e.userId),
  type: e.type,
  dir: e.direction,
  amt: e.amount,
  flow: e.flow,
  refType: e.referenceType,
  bal: `${e.balanceBefore}→${e.balanceAfter}`,
  desc: (e.description || '').slice(0, 90),
}));

const bizVisible = rows.filter((r) => {
  if (r.who !== 'bdg') return false;
  if (r.type === 'lock') return false;
  if (r.refType === 'withdrawal_list_fee_refund') return false;
  if (
    r.type === 'commission' &&
    r.dir === 'debit' &&
    r.flow === 'platform_fee' &&
    HIDDEN_OUT.has(r.refType)
  )
    return false;
  return true;
});

const adminRows = rows.filter((r) => r.who === 'admin');

console.log(
  JSON.stringify(
    {
      bizVisible,
      adminRows,
      adminFeeIn: adminRows.filter(
        (r) => r.dir === 'credit' && r.flow === 'platform_fee',
      ),
      adminBonusOut: adminRows.filter(
        (r) => r.dir === 'debit' && r.flow === 'investor_commission',
      ),
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
