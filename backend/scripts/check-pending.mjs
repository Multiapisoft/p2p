import mongoose from 'mongoose';

await mongoose.connect('mongodb://localhost:27017/p2p_platform');
const payments = await mongoose.connection.db.collection('withdrawal_payments').find({}).toArray();
for (const p of payments) {
  console.log({
    ref: p.referenceId,
    amount: p.amount,
    status: p.status,
    payerUserId: p.payerUserId,
    payerType: typeof p.payerUserId,
    ctor: p.payerUserId?.constructor?.name,
    autoApproveAt: p.autoApproveAt,
  });
}
const wds = await mongoose.connection.db
  .collection('withdrawals')
  .find({ referenceId: /5D6DF1ED/ })
  .toArray();
console.log(
  'wd',
  wds.map((w) => ({
    ref: w.referenceId,
    amount: w.amount,
    paid: w.paidAmount,
    reserved: w.reservedAmount,
  })),
);
await mongoose.disconnect();
