import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const user = await db.collection('users').findOne({ email: 'bdg@gmail.com' });
const biz = await db.collection('businesses').findOne({ ownerId: user?._id });
console.log('biz', String(biz?._id), biz?.name);

const pays = await db
  .collection('withdrawal_payments')
  .find({ $or: [{ businessId: biz?._id }, { payerBusinessId: biz?._id }] })
  .sort({ createdAt: -1 })
  .limit(8)
  .toArray();

for (const p of pays) {
  console.log(
    'PAY',
    JSON.stringify({
      ref: p.referenceId,
      amt: p.amount,
      status: p.status,
      wdFee: p.withdrawalFee ?? p.businessCommission,
      depFee: p.depositFee,
      bonus: p.bonusAmount,
      net: p.netCreditedAmount,
      created: p.createdAt,
      wdId: String(p.withdrawalId),
      payerRole: p.payerRole,
    }),
  );
}

const wds = await db
  .collection('withdrawals')
  .find({ businessId: biz?._id })
  .sort({ createdAt: -1 })
  .limit(5)
  .toArray();

for (const w of wds) {
  console.log(
    'WD',
    JSON.stringify({
      ref: w.referenceId,
      amt: w.amount,
      paid: w.paidAmount,
      listFee: w.p2pListFeeBurned,
      walletCol: w.p2pListFeeWalletCollected,
      status: w.status,
      list: w.p2pListStatus,
      created: w.createdAt,
    }),
  );
}

const ledgers = await db
  .collection('ledger_entries')
  .find({
    businessId: biz?._id,
    createdAt: { $gte: new Date('2026-09-24T11:00:00.000Z') },
  })
  .sort({ createdAt: -1 })
  .limit(15)
  .toArray();

for (const l of ledgers) {
  console.log(
    'LED',
    JSON.stringify({
      t: l.type,
      d: l.direction,
      amt: l.amount,
      ref: l.referenceType,
      desc: (l.description || '').slice(0, 90),
      at: l.createdAt,
    }),
  );
}

const cfgs = await db
  .collection('commission_configs')
  .find({})
  .limit(50)
  .toArray()
  .catch(() => []);
const cfgs2 = cfgs.length
  ? cfgs
  : await db.collection('commissionconfigs').find({}).limit(50).toArray();
console.log(
  'CFG_COL',
  cfgs.length ? 'commission_configs' : 'commissionconfigs',
  cfgs2
    .filter(
      (c) =>
        !c.targetId ||
        String(c.targetId) === String(biz?._id) ||
        c.targetType === 'investor' ||
        c.targetType === 'business' ||
        c.targetType === 'platform',
    )
    .map((c) => ({
      type: c.targetType,
      tid: c.targetId ? String(c.targetId) : null,
      kind: c.txnKind || c.kind,
      pct: c.percentage,
      method: c.paymentMethod,
      active: c.isActive,
    })),
);

await mongoose.disconnect();
