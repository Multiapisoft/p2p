/**
 * Backfill: listed WDs where pay-limit fee was burned on Approve but admin
 * wallet was never credited (p2pListFeeWalletCollected=false, burned>0).
 */
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const admin = await db.collection('users').findOne({ role: 'admin' });
if (!admin) throw new Error('no admin');

const wds = await db
  .collection('withdrawals')
  .find({
    p2pListStatus: 'listed',
    p2pListFeeWalletCollected: { $ne: true },
    p2pListFeeBurned: { $gt: 0 },
    origin: { $ne: 'business' },
  })
  .toArray();

console.log('listed WDs missing admin fee credit', wds.length);

for (const wd of wds) {
  const feeLeft = Math.round((wd.p2pListFeeBurned || 0) * 100) / 100;
  if (feeLeft <= 0 || !wd.businessId) continue;

  const biz = await db.collection('businesses').findOne({ _id: wd.businessId });
  if (!biz?.ownerId) {
    console.log(wd.referenceId, 'no business owner');
    continue;
  }

  const ownerWallets = await db
    .collection('wallets')
    .find({ $or: [{ userId: biz.ownerId }, { userId: String(biz.ownerId) }] })
    .toArray();
  let bizWallet =
    ownerWallets.find((x) => String(x.currency || '').toUpperCase() === 'INR') ||
    ownerWallets[0];
  const adminWallets = await db
    .collection('wallets')
    .find({ $or: [{ userId: admin._id }, { userId: String(admin._id) }] })
    .toArray();
  let adminWallet =
    adminWallets.find((x) => String(x.currency || '').toUpperCase() === 'INR') ||
    adminWallets[0];

  if (!bizWallet || !adminWallet) {
    console.log(wd.referenceId, 'wallet missing');
    continue;
  }

  // Skip if list-fee ledger already credited admin for this WD
  const existing = await db.collection('ledger_entries').findOne({
    userId: admin._id,
    referenceType: 'withdrawal_list_fee',
    referenceId: String(wd._id),
    direction: 'credit',
  });
  if (existing) {
    await db.collection('withdrawals').updateOne(
      { _id: wd._id },
      { $set: { p2pListFeeWalletCollected: true } },
    );
    console.log(wd.referenceId, 'flag only (ledger exists)');
    continue;
  }

  const now = new Date();
  const bizBefore = bizWallet.balance || 0;
  const adminBefore = adminWallet.balance || 0;
  const bizAfter = Math.round((bizBefore - feeLeft) * 100) / 100;
  const adminAfter = Math.round((adminBefore + feeLeft) * 100) / 100;

  await db.collection('wallets').updateOne({ _id: bizWallet._id }, { $set: { balance: bizAfter } });
  await db.collection('wallets').updateOne({ _id: adminWallet._id }, { $set: { balance: adminAfter } });

  await db.collection('ledger_entries').insertMany([
    {
      userId: biz.ownerId,
      walletId: bizWallet._id,
      type: 'commission',
      direction: 'debit',
      flow: 'platform_fee',
      amount: feeLeft,
      currency: 'INR',
      balanceBefore: bizBefore,
      balanceAfter: bizAfter,
      referenceType: 'withdrawal_list_fee',
      referenceId: String(wd._id),
      description: `Business fee ₹${feeLeft} paid to Super Admin (admin) (${wd.referenceId})`,
      businessId: wd.businessId,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: admin._id,
      walletId: adminWallet._id,
      type: 'commission',
      direction: 'credit',
      flow: 'platform_fee',
      amount: feeLeft,
      currency: 'INR',
      balanceBefore: adminBefore,
      balanceAfter: adminAfter,
      referenceType: 'withdrawal_list_fee',
      referenceId: String(wd._id),
      description: `Business fee ₹${feeLeft} received from ${biz.name} (business) (${wd.referenceId})`,
      businessId: wd.businessId,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.collection('withdrawals').updateOne(
    { _id: wd._id },
    { $set: { p2pListFeeWalletCollected: true } },
  );
  console.log(wd.referenceId, 'credited admin', feeLeft);
}

await mongoose.disconnect();
console.log('Done');
