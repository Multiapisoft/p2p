import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const bizId = new mongoose.Types.ObjectId('6ab4e0a83af1abc4190a8600');
const wdId = new mongoose.Types.ObjectId('6ab508c84852276f49975401');

const wd = await db.collection('withdrawals').findOne({ _id: wdId });
console.log(
  'wd',
  JSON.stringify({
    ref: wd.referenceId,
    amount: wd.amount,
    paidAmount: wd.paidAmount,
    origin: wd.origin,
    p2pListFeeBurned: wd.p2pListFeeBurned,
    p2pListFeeWalletCollected: wd.p2pListFeeWalletCollected,
    commissionAmount: wd.commissionAmount,
    p2pListedAt: wd.p2pListedAt,
  }),
);

const cfgs = await db
  .collection('commission_configs')
  .find({ targetId: bizId, isActive: true })
  .toArray();
console.log(
  'commission_configs',
  cfgs.map((c) => ({
    targetType: c.targetType,
    percentage: c.percentage,
    appliesTo: c.appliesTo,
    feeMode: c.feeMode,
    paymentMethod: c.paymentMethod,
    name: c.name,
  })),
);

const pays = await db
  .collection('withdrawal_payments')
  .find({ withdrawalId: wdId })
  .sort({ createdAt: 1 })
  .toArray();
console.log('all_pays_on_wd', pays.length);
for (const p of pays) {
  const payer = await db.collection('users').findOne({ _id: p.payerUserId });
  console.log(
    JSON.stringify({
      ref: p.referenceId,
      amount: p.amount,
      status: p.status,
      commissionAmount: p.commissionAmount,
      bonusAmount: p.bonusAmount,
      payerRole: payer?.role,
      payerName: payer?.name,
      payerBusinessId: p.payerBusinessId,
      completedAt: p.completedAt,
    }),
  );
}

const feeRows = await db
  .collection('ledger_entries')
  .find({
    $or: [
      { referenceId: wdId },
      { referenceId: { $in: pays.map((p) => p._id) } },
      { description: new RegExp(wd.referenceId) },
    ],
  })
  .sort({ createdAt: 1 })
  .toArray();
console.log('fee_rows', feeRows.length);
for (const t of feeRows) {
  console.log(
    JSON.stringify({
      createdAt: t.createdAt,
      amount: t.amount,
      type: t.type,
      direction: t.direction,
      flow: t.flow,
      description: t.description,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
    }),
  );
}

await mongoose.disconnect();
