/**
 * Clean messy list-fee → payment relink ledger rows.
 * Keep per-payment fee IN (retag wd_fee_settle → withdrawal_payment).
 * Delete bulk withdrawal_list_fee + withdrawal_list_fee_refund (relink noise).
 */
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const settles = await db
  .collection('ledger_entries')
  .find({ referenceType: 'wd_fee_settle' })
  .project({ referenceId: 1, description: 1, userId: 1 })
  .toArray();

console.log('wd_fee_settle rows', settles.length);

const payIds = [
  ...new Set(settles.map((s) => String(s.referenceId)).filter(Boolean)),
];
const payObjectIds = payIds
  .filter((id) => mongoose.isValidObjectId(id))
  .map((id) => new mongoose.Types.ObjectId(id));

const pays = await db
  .collection('withdrawal_payments')
  .find({ _id: { $in: payObjectIds } })
  .project({ withdrawalId: 1 })
  .toArray();

const wdIdStrs = [...new Set(pays.map((p) => String(p.withdrawalId)))];
const wdObjectIds = wdIdStrs.map((id) => new mongoose.Types.ObjectId(id));

console.log('withdrawals', wdIdStrs);

const del = await db.collection('ledger_entries').deleteMany({
  $or: [
    {
      referenceType: { $in: ['withdrawal_list_fee', 'withdrawal_list_fee_refund'] },
      referenceId: { $in: [...wdIdStrs, ...wdObjectIds] },
    },
    {
      referenceType: 'withdrawal_list_fee_refund',
      description: /relink/i,
    },
  ],
});
console.log('deleted list/refund rows', del.deletedCount);

const retag = await db.collection('ledger_entries').updateMany(
  { referenceType: 'wd_fee_settle' },
  { $set: { referenceType: 'withdrawal_payment' } },
);
console.log('retagged settles', retag.modifiedCount);

const flag = await db.collection('withdrawals').updateMany(
  { _id: { $in: wdObjectIds } },
  { $set: { p2pListFeeWalletCollected: false, p2pListFeeBurned: 0 } },
);
console.log('flags updated', flag.modifiedCount);

await mongoose.disconnect();
console.log('Done');
