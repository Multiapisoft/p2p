const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/p2p_platform');
  const db = mongoose.connection.db;
  const tickets = await db
    .collection('support_tickets')
    .find({ userId: { $type: 'string' } })
    .toArray();

  for (const t of tickets) {
    if (!/^[a-f0-9]{24}$/i.test(String(t.userId))) continue;
    await db.collection('support_tickets').updateOne(
      { _id: t._id },
      { $set: { userId: new mongoose.Types.ObjectId(String(t.userId)) } },
    );
    console.log('fixed userId', t.ticketId);
  }
  console.log('done', tickets.length);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
