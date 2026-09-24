import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const wdId = new mongoose.Types.ObjectId('6ab508c84852276f49975401');
const pays = await db
  .collection('withdrawal_payments')
  .find({ withdrawalId: wdId, status: 'completed' })
  .toArray();
console.log(
  'pays',
  pays.map((p) => ({
    ref: p.referenceId,
    amt: p.amount,
    bonus: p.bonusAmount,
    estComm: p.estimatedCommissionAmount,
    wdFee: p.withdrawalFee,
    bizComm: p.businessCommission,
  })),
);
const sum = pays.reduce((s, p) => s + (p.amount || 0), 0);
console.log('sumPaid', sum, 'count', pays.length);
await mongoose.disconnect();
