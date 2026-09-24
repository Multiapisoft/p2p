import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const wdId = new mongoose.Types.ObjectId('6ab508c84852276f49975401');
const wd = await db.collection('withdrawals').findOne({ _id: wdId });
console.log(
  'WD',
  JSON.stringify({
    ref: wd?.referenceId,
    amt: wd?.amount,
    paid: wd?.paidAmount,
    biz: String(wd?.businessId),
    listFee: wd?.p2pListFeeBurned,
    walletCol: wd?.p2pListFeeWalletCollected,
    status: wd?.status,
    list: wd?.p2pListStatus,
    origin: wd?.origin,
    method: wd?.method,
  }),
);

const pay = await db.collection('withdrawal_payments').findOne({
  referenceId: 'WDP-1790251141189-9F9E2844',
});
console.log(
  'PAY',
  JSON.stringify({
    amt: pay?.amount,
    status: pay?.status,
    wdFee: pay?.withdrawalFee,
    bizComm: pay?.businessCommission,
    depFee: pay?.depositFee,
    bonus: pay?.bonusAmount,
    estBonus: pay?.estimatedBonusAmount,
    estComm: pay?.estimatedCommissionAmount,
    net: pay?.netCreditedAmount,
    payerBiz: pay?.payerBusinessId ? String(pay.payerBusinessId) : null,
    wdBiz: pay?.businessId ? String(pay.businessId) : null,
    payer: pay?.payerUserId ? String(pay.payerUserId) : null,
  }),
);

const biz = await db.collection('businesses').findOne({ _id: wd.businessId });
const owner = await db.collection('users').findOne({ _id: biz?.ownerId });
console.log('BIZ', biz?.name, owner?.email, String(biz?._id));

const cfgs = await db
  .collection('commission_configs')
  .find({
    $or: [
      { targetId: biz?._id },
      { targetType: 'investor_bonus' },
      { targetType: 'investor' },
      { targetType: 'business', targetId: null },
      { targetType: 'business', targetId: { $exists: false } },
    ],
  })
  .toArray();

console.log(
  'CFGS',
  cfgs.map((c) => ({
    type: c.targetType,
    tid: c.targetId ? String(c.targetId) : null,
    appliesTo: c.appliesTo,
    pct: c.percentage,
    fixed: c.fixedFee,
    mode: c.feeMode,
    method: c.paymentMethod,
    min: c.minAmount,
    max: c.maxAmount,
  })),
);

const invBonus = await db
  .collection('commission_configs')
  .find({ targetType: /investor/i })
  .toArray();
console.log(
  'INV',
  invBonus.map((c) => ({
    type: c.targetType,
    tid: c.targetId ? String(c.targetId) : null,
    appliesTo: c.appliesTo,
    pct: c.percentage,
    method: c.paymentMethod,
  })),
);

const bizCfgs = await db
  .collection('commission_configs')
  .find({ targetId: biz?._id })
  .toArray();
console.log(
  'BIZCFG',
  bizCfgs.map((c) => ({
    appliesTo: c.appliesTo,
    pct: c.percentage,
    method: c.paymentMethod,
    min: c.minAmount,
    max: c.maxAmount,
    active: c.isActive,
  })),
);

const ledgers = await db
  .collection('ledger_entries')
  .find({
    $or: [
      { referenceId: String(wdId) },
      { referenceId: String(pay?._id) },
      { referenceId: pay?.referenceId },
    ],
  })
  .sort({ createdAt: 1 })
  .toArray();

for (const l of ledgers) {
  console.log(
    'L',
    JSON.stringify({
      uid: String(l.userId),
      t: l.type,
      dir: l.direction,
      amt: l.amount,
      ref: l.referenceType,
      flow: l.flow,
      desc: (l.description || '').slice(0, 100),
      at: l.createdAt,
    }),
  );
}

const fee325 = await db
  .collection('ledger_entries')
  .find({
    amount: 325,
    createdAt: { $gte: new Date('2026-09-24T11:30:00.000Z') },
  })
  .toArray();
console.log(
  'FEE325',
  fee325.map((l) => ({
    ref: l.referenceType,
    rid: l.referenceId,
    desc: (l.description || '').slice(0, 80),
    dir: l.direction,
    at: l.createdAt,
  })),
);

await mongoose.disconnect();
