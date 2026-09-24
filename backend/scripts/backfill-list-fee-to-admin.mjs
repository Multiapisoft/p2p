/**
 * One-shot: for listed WDs where pay-limit fee was burned on Approve but
 * admin wallet was never credited, collect business fee → admin now.
 *
 * Usage (on server, from backend/):
 *   docker compose exec -T backend node scripts/backfill-list-fee-to-admin.mjs
 */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI missing');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

const withdrawals = await db
  .collection('withdrawals')
  .find({
    p2pListStatus: 'listed',
    p2pListFeeBurned: { $gt: 0 },
    $or: [
      { p2pListFeeWalletCollected: { $ne: true } },
      { p2pListFeeWalletCollected: { $exists: false } },
    ],
  })
  .project({
    _id: 1,
    referenceId: 1,
    businessId: 1,
    p2pListFeeBurned: 1,
  })
  .toArray();

console.log(`Found ${withdrawals.length} WD(s) needing admin fee credit`);

if (!withdrawals.length) {
  await mongoose.disconnect();
  process.exit(0);
}

const admin = await db.collection('users').findOne({ role: 'admin' });
if (!admin) {
  console.error('No admin user');
  process.exit(1);
}

for (const w of withdrawals) {
  const fee = Math.round((w.p2pListFeeBurned || 0) * 100) / 100;
  if (fee <= 0 || !w.businessId) continue;

  const already = await db.collection('ledger_entries').findOne({
    userId: admin._id,
    referenceType: 'withdrawal_list_fee',
    referenceId: String(w._id),
    type: 'commission',
    direction: 'credit',
  });
  if (already) {
    await db.collection('withdrawals').updateOne(
      { _id: w._id },
      { $set: { p2pListFeeWalletCollected: true } },
    );
    console.log(`Skip ${w.referenceId}: admin ledger already has fee`);
    continue;
  }

  const business = await db.collection('businesses').findOne({ _id: w.businessId });
  if (!business?.ownerId) {
    console.error(`Skip ${w.referenceId}: business/owner missing`);
    continue;
  }

  let bizWallet = await db.collection('wallets').findOne({
    userId: business.ownerId,
    businessId: w.businessId,
    currency: 'INR',
  });
  if (!bizWallet) {
    bizWallet = await db.collection('wallets').findOne({
      userId: business.ownerId,
      currency: 'INR',
    });
  }
  let adminWallet = await db.collection('wallets').findOne({
    userId: admin._id,
    currency: 'INR',
  });
  if (!bizWallet || !adminWallet) {
    console.error(`Skip ${w.referenceId}: wallet missing`);
    continue;
  }

  const bizBefore = bizWallet.balance || 0;
  const adminBefore = adminWallet.balance || 0;
  const bizAfter = Math.round((bizBefore - fee) * 100) / 100;
  const adminAfter = Math.round((adminBefore + fee) * 100) / 100;

  await db.collection('wallets').updateOne(
    { _id: bizWallet._id },
    { $set: { balance: bizAfter } },
  );
  await db.collection('wallets').updateOne(
    { _id: adminWallet._id },
    { $set: { balance: adminAfter } },
  );

  const now = new Date();
  const bizName = business.name || 'Business';
  const adminName = admin.name || 'Admin';

  await db.collection('ledger_entries').insertMany([
    {
      userId: business.ownerId,
      walletId: bizWallet._id,
      type: 'commission',
      direction: 'debit',
      flow: 'platform_fee',
      amount: fee,
      currency: 'INR',
      balanceBefore: bizBefore,
      balanceAfter: bizAfter,
      referenceType: 'withdrawal_list_fee',
      referenceId: String(w._id),
      description: `Business fee ₹${fee} paid to ${adminName} (admin) (${w.referenceId})`,
      businessId: w.businessId,
      counterpartyUserId: admin._id,
      fromParty: `${bizName} (business)`,
      toParty: `${adminName} (admin)`,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: admin._id,
      walletId: adminWallet._id,
      type: 'commission',
      direction: 'credit',
      flow: 'platform_fee',
      amount: fee,
      currency: 'INR',
      balanceBefore: adminBefore,
      balanceAfter: adminAfter,
      referenceType: 'withdrawal_list_fee',
      referenceId: String(w._id),
      description: `Business fee ₹${fee} received from ${bizName} (business) (${w.referenceId})`,
      businessId: w.businessId,
      counterpartyUserId: business.ownerId,
      fromParty: `${bizName} (business)`,
      toParty: `${adminName} (admin)`,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.collection('withdrawals').updateOne(
    { _id: w._id },
    { $set: { p2pListFeeWalletCollected: true } },
  );

  console.log(
    `Credited admin ₹${fee} for ${w.referenceId} (admin ${adminBefore} → ${adminAfter})`,
  );
}

await mongoose.disconnect();
console.log('Done');
