import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const ref = process.argv[2] || 'WDR-1790249160632-DEDA98EF';

const wd = await db.collection('withdrawals').findOne({ referenceId: ref });
if (!wd) {
  console.log('WD not found', ref);
  process.exit(1);
}

const pays = await db
  .collection('withdrawal_payments')
  .find({ withdrawalId: wd._id })
  .project({ referenceId: 1, amount: 1, status: 1 })
  .toArray();

const payIds = pays.map((p) => String(p._id));
const entries = await db
  .collection('ledger_entries')
  .find({
    $or: [
      { referenceId: String(wd._id) },
      { referenceId: { $in: payIds } },
      { description: new RegExp(ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) },
      ...pays.map((p) => ({
        description: new RegExp(
          String(p.referenceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        ),
      })),
    ],
  })
  .sort({ createdAt: 1 })
  .toArray();

const admin = await db.collection('users').findOne({ role: 'admin' });
const biz = await db.collection('businesses').findOne({ _id: wd.businessId });

const brief = entries.map((e) => ({
  dir: e.direction,
  amount: e.amount,
  type: e.type,
  flow: e.flow,
  refType: e.referenceType,
  refId: String(e.referenceId || ''),
  who: String(e.userId) === String(admin?._id) ? 'admin' : String(e.userId) === String(biz?.ownerId) ? 'business' : String(e.userId),
  desc: (e.description || '').slice(0, 100),
  at: e.createdAt,
}));

const feeSettle = brief.filter((e) => e.refType === 'wd_fee_settle');
const refund = brief.filter((e) => e.refType === 'withdrawal_list_fee_refund');
const adminIn = feeSettle.filter((e) => e.who === 'admin' && e.dir === 'credit');
const bizOut = feeSettle.filter((e) => e.who === 'business' && e.dir === 'debit');

console.log(
  JSON.stringify(
    {
      wd: {
        referenceId: wd.referenceId,
        amount: wd.amount,
        p2pListFeeBurned: wd.p2pListFeeBurned,
        p2pListFeeWalletCollected: wd.p2pListFeeWalletCollected,
      },
      pays,
      refund,
      adminFeeIn: adminIn,
      businessFeeOut: bizOut,
      adminInTotal: adminIn.reduce((s, e) => s + e.amount, 0),
      bizOutTotal: bizOut.reduce((s, e) => s + e.amount, 0),
      relatedCount: brief.length,
      related: brief,
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
