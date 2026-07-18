/**
 * Backfill dispute tickets so investor (payer) + business can see them.
 * Run: node scripts/backfill-dispute-ticket-access.js
 */
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/p2p_platform');
  const db = mongoose.connection.db;

  const tickets = await db
    .collection('support_tickets')
    .find({ category: 'withdrawal_dispute' })
    .toArray();

  let updated = 0;
  for (const t of tickets) {
    const paymentRef = (t.subject || '').match(/payment\s+(WDP-[A-Z0-9-]+)/i)?.[1];
    let payment = null;
    if (paymentRef) {
      payment = await db.collection('withdrawal_payments').findOne({ referenceId: paymentRef });
    }
    if (!payment && t.message) {
      const idMatch = t.message.match(/Payment ID:\s*([a-f0-9]{24})/i);
      if (idMatch) {
        payment = await db
          .collection('withdrawal_payments')
          .findOne({ _id: new mongoose.Types.ObjectId(idMatch[1]) });
      }
    }
    if (!payment) {
      console.log('skip (no payment)', t.ticketId);
      continue;
    }

    const withdrawal = await db.collection('withdrawals').findOne({ _id: payment.withdrawalId });
    const businessId = payment.businessId || withdrawal?.businessId || null;

    await db.collection('support_tickets').updateOne(
      { _id: t._id },
      {
        $set: {
          participantIds: [payment.payerUserId],
          businessId,
          relatedPaymentId: payment._id,
          relatedWithdrawalId: payment.withdrawalId,
        },
      },
    );
    updated += 1;
    console.log('updated', t.ticketId, {
      payer: String(payment.payerUserId),
      businessId: businessId ? String(businessId) : null,
    });
  }

  console.log('done', { total: tickets.length, updated });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
