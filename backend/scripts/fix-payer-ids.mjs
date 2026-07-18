import mongoose from 'mongoose';

await mongoose.connect('mongodb://localhost:27017/p2p_platform');
const col = mongoose.connection.db.collection('withdrawal_payments');
const docs = await col.find({ payerUserId: { $type: 'string' } }).toArray();
let n = 0;
for (const d of docs) {
  await col.updateOne(
    { _id: d._id },
    { $set: { payerUserId: new mongoose.Types.ObjectId(d.payerUserId) } },
  );
  n++;
}
console.log(`fixed ${n} payerUserId(s)`);
await mongoose.disconnect();
