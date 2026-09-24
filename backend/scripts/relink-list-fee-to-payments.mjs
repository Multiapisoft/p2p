/**
 * Re-link list-prepaid WD fees onto each completed payment so admin ledger
 * shows fee IN per payment (matched with investor bonus OUT).
 * Net wallet movement ≈ 0 when list fee already equals sum of payment WD fees.
 */
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const admin = await db.collection('users').findOne({ role: 'admin' });
if (!admin) throw new Error('no admin');

const wds = await db
  .collection('withdrawals')
  .find({ p2pListFeeWalletCollected: true })
  .toArray();

console.log('prepaid WDs', wds.length);

for (const wd of wds) {
  const biz = await db.collection('businesses').findOne({ _id: wd.businessId });
  if (!biz?.ownerId) continue;

  const pays = await db
    .collection('withdrawal_payments')
    .find({ withdrawalId: wd._id, status: 'completed' })
    .toArray();

  // WD fee = business withdrawal % of pay (from estComm when no deposit, else amount * cfg)
  const bizWdCfg = await db.collection('commission_configs').findOne({
    targetType: 'business',
    targetId: wd.businessId,
    appliesTo: 'withdrawal',
    isActive: true,
  });
  const pct = bizWdCfg?.percentage ?? 10;

  let need = 0;
  const plan = [];
  for (const p of pays) {
    const existing = await db.collection('ledger_entries').findOne({
      referenceType: 'withdrawal_payment',
      referenceId: String(p._id),
      type: 'commission',
      direction: 'credit',
      userId: admin._id,
      flow: 'platform_fee',
    });
    if (existing) continue;
    // Prefer stored estimate WD-only: for investor pays estComm is WD fee; for users
    // estComm = WD + deposit — use amount * pct for WD owner fee only.
    const wdFee = Math.round(((p.amount || 0) * pct) / 100 * 100) / 100;
    if (wdFee <= 0) continue;
    plan.push({ p, wdFee });
    need += wdFee;
  }
  need = Math.round(need * 100) / 100;
  if (!plan.length) {
    console.log(wd.referenceId, 'already linked');
    continue;
  }

  const listFeeCredit = await db.collection('ledger_entries').findOne({
    referenceType: 'withdrawal_list_fee',
    referenceId: String(wd._id),
    userId: admin._id,
    direction: 'credit',
  });
  const listAmt = listFeeCredit?.amount || 0;

  const ownerId = biz.ownerId;
  let bizWallet = await db.collection('wallets').findOne({ userId: ownerId, currency: 'INR' });
  let adminWallet = await db.collection('wallets').findOne({ userId: admin._id, currency: 'INR' });
  if (!bizWallet || !adminWallet) {
    console.log(wd.referenceId, 'wallet missing');
    continue;
  }

  // Reverse list wallet fee if present (so we can re-post per payment).
  if (listAmt > 0) {
    const now = new Date();
    const bizBefore = bizWallet.balance || 0;
    const adminBefore = adminWallet.balance || 0;
    const bizAfter = Math.round((bizBefore + listAmt) * 100) / 100;
    const adminAfter = Math.round((adminBefore - listAmt) * 100) / 100;
    await db.collection('wallets').updateOne({ _id: bizWallet._id }, { $set: { balance: bizAfter } });
    await db.collection('wallets').updateOne({ _id: adminWallet._id }, { $set: { balance: adminAfter } });
    await db.collection('ledger_entries').insertMany([
      {
        userId: admin._id,
        walletId: adminWallet._id,
        type: 'commission',
        direction: 'debit',
        flow: 'platform_fee',
        amount: listAmt,
        currency: 'INR',
        balanceBefore: adminBefore,
        balanceAfter: adminAfter,
        referenceType: 'withdrawal_list_fee_refund',
        referenceId: String(wd._id),
        description: `Business fee ₹${listAmt} refunded to ${biz.name} (business) (${wd.referenceId}) — relink to payments`,
        businessId: wd.businessId,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: ownerId,
        walletId: bizWallet._id,
        type: 'commission',
        direction: 'credit',
        flow: 'platform_fee',
        amount: listAmt,
        currency: 'INR',
        balanceBefore: bizBefore,
        balanceAfter: bizAfter,
        referenceType: 'withdrawal_list_fee_refund',
        referenceId: String(wd._id),
        description: `Business fee ₹${listAmt} refunded from Super Admin (admin) (${wd.referenceId}) — relink to payments`,
        businessId: wd.businessId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    bizWallet = await db.collection('wallets').findOne({ _id: bizWallet._id });
    adminWallet = await db.collection('wallets').findOne({ _id: adminWallet._id });
    console.log(wd.referenceId, 'refunded list fee', listAmt);
  }

  for (const { p, wdFee } of plan) {
    bizWallet = await db.collection('wallets').findOne({ _id: bizWallet._id });
    adminWallet = await db.collection('wallets').findOne({ _id: adminWallet._id });
    const bizBefore = bizWallet.balance || 0;
    const adminBefore = adminWallet.balance || 0;
    const bizAfter = Math.round((bizBefore - wdFee) * 100) / 100;
    const adminAfter = Math.round((adminBefore + wdFee) * 100) / 100;
    await db.collection('wallets').updateOne({ _id: bizWallet._id }, { $set: { balance: bizAfter } });
    await db.collection('wallets').updateOne({ _id: adminWallet._id }, { $set: { balance: adminAfter } });
    const now = new Date();
    const label = p.referenceId || wd.referenceId;
    await db.collection('ledger_entries').insertMany([
      {
        userId: ownerId,
        walletId: bizWallet._id,
        type: 'commission',
        direction: 'debit',
        flow: 'platform_fee',
        amount: wdFee,
        currency: 'INR',
        balanceBefore: bizBefore,
        balanceAfter: bizAfter,
        referenceType: 'withdrawal_payment',
        referenceId: String(p._id),
        description: `Business fee ₹${wdFee} paid to Super Admin (admin) (${label})`,
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
        amount: wdFee,
        currency: 'INR',
        balanceBefore: adminBefore,
        balanceAfter: adminAfter,
        referenceType: 'withdrawal_payment',
        referenceId: String(p._id),
        description: `Business fee ₹${wdFee} received from ${biz.name} (business) (${label})`,
        businessId: wd.businessId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    console.log('linked', label, 'wdFee', wdFee);
  }

  await db.collection('withdrawals').updateOne(
    { _id: wd._id },
    { $set: { p2pListFeeWalletCollected: false, p2pListFeeBurned: 0 } },
  );
}

await mongoose.disconnect();
console.log('Done');
