const mongoose = require('mongoose');
const uri =
  process.env.MONGODB_URI ||
  'mongodb+srv://dev2brtmultisoftware_db_user:44C0EtU4rwVku1Dx@cluster0.7e9qrgz.mongodb.net/p2p?appName=Cluster0';

(async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const wds = await db
    .collection('withdrawals')
    .find({ origin: 'business', status: 'completed' })
    .sort({ completedAt: -1 })
    .limit(5)
    .toArray();
  console.log('Recent completed business WDs:', wds.length);
  for (const w of wds) {
    const id = w._id.toString();
    const ledgers = await db
      .collection('ledger_entries')
      .find({ referenceId: id })
      .project({
        type: 1,
        direction: 1,
        amount: 1,
        referenceType: 1,
        description: 1,
        userId: 1,
        businessId: 1,
        balanceBefore: 1,
        balanceAfter: 1,
        flow: 1,
        createdAt: 1,
      })
      .toArray();
    console.log(
      '\n=== WD',
      id,
      'amount',
      w.amount,
      'commissionAmount',
      w.commissionAmount,
      'biz',
      w.businessId?.toString(),
      'user',
      w.userId?.toString(),
      'completedAt',
      w.completedAt,
    );
    console.log('ledger count', ledgers.length);
    for (const l of ledgers) {
      console.log(
        ' ',
        l.type,
        l.direction,
        l.amount,
        l.referenceType,
        l.flow || '-',
        (l.description || '').slice(0, 90),
        'userId=',
        String(l.userId),
        'userCtor=',
        l.userId?.constructor?.name,
      );
    }
  }
  const fees = await db
    .collection('ledger_entries')
    .find({
      type: 'p2p_limit',
      referenceType: 'withdrawal_payment_fee',
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log('\n=== Recent withdrawal_payment_fee p2p_limit rows:', fees.length);
  for (const l of fees) {
    console.log(
      ' ',
      l.createdAt,
      l.amount,
      l.referenceId,
      (l.description || '').slice(0, 90),
      'userId=',
      String(l.userId),
    );
  }
  const holds = await db
    .collection('ledger_entries')
    .find({
      type: 'p2p_limit',
      referenceType: 'business_withdrawal_hold',
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();
  console.log('\n=== Recent business_withdrawal_hold rows:', holds.length);
  for (const l of holds) {
    console.log(
      ' ',
      l.createdAt,
      l.amount,
      l.referenceId,
      (l.description || '').slice(0, 90),
    );
  }
  const comms = await db
    .collection('ledger_entries')
    .find({
      type: 'commission',
      referenceType: { $in: ['business_withdrawal', 'withdrawal'] },
      direction: 'debit',
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log('\n=== Recent business_withdrawal/withdrawal COMMISSION debits:', comms.length);
  for (const l of comms) {
    console.log(
      ' ',
      l.createdAt,
      l.amount,
      l.referenceType,
      l.referenceId,
      (l.description || '').slice(0, 70),
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
