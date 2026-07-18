import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/p2p_platform';
const USER_EMAIL = 'withdrawtest@gmail.com';

const withdrawalSchema = new mongoose.Schema({}, { strict: false, collection: 'withdrawals' });
const walletSchema = new mongoose.Schema({}, { strict: false, collection: 'wallets' });
const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const Wallet = mongoose.model('Wallet', walletSchema);
const User = mongoose.model('User', userSchema);

const requests = [
  { amount: 5000, method: 'upi', upiDetails: { upiId: 'rahul@oksbi', payerName: 'Rahul Kumar' } },
  {
    amount: 12500,
    method: 'bank',
    bankDetails: {
      accountNumber: '123456789012',
      ifscCode: 'HDFC0001234',
      accountHolderName: 'Priya Sharma',
      bankName: 'HDFC',
    },
  },
  { amount: 2500, method: 'upi', upiDetails: { upiId: 'amit@ybl', payerName: 'Amit Singh' } },
  {
    amount: 8000,
    method: 'bank',
    bankDetails: {
      accountNumber: '987654321098',
      ifscCode: 'SBIN0005678',
      accountHolderName: 'Neha Verma',
      bankName: 'SBI',
    },
  },
];

await mongoose.connect(MONGODB_URI);
const user = await User.findOne({ email: USER_EMAIL });
if (!user) {
  console.error('User not found:', USER_EMAIL);
  process.exit(1);
}

const userId = user._id;
let wallet = await Wallet.findOne({ userId, currency: 'INR' });
if (!wallet) {
  wallet = await Wallet.create({
    userId,
    currency: 'INR',
    balance: 0,
    lockedBalance: 0,
    totalDeposited: 0,
    totalInvested: 0,
    totalRedeemed: 0,
  });
}

const needed = requests.reduce((s, r) => s + r.amount, 0);
const available = (wallet.balance || 0) - (wallet.lockedBalance || 0);
if (available < needed) {
  const topUp = needed - available + 50000;
  await Wallet.updateOne(
    { _id: wallet._id },
    { $inc: { balance: topUp, totalDeposited: topUp } },
  );
  console.log(`Wallet topped up by ₹${topUp}`);
  wallet = await Wallet.findById(wallet._id);
}

const created = [];
for (const req of requests) {
  const existing = await Withdrawal.findOne({
    userId,
    amount: req.amount,
    method: req.method,
    status: 'pending',
  });
  if (existing) {
    console.log('Skip existing:', existing.referenceId);
    created.push(existing);
    continue;
  }

  const referenceId = `WDR-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
  await Wallet.updateOne({ _id: wallet._id }, { $inc: { lockedBalance: req.amount } });

  const doc = await Withdrawal.create({
    referenceId,
    userId,
    walletId: wallet._id,
    amount: req.amount,
    paidAmount: 0,
    currency: 'INR',
    method: req.method,
    status: 'pending',
    upiDetails: req.upiDetails,
    bankDetails: req.bankDetails,
    usdtDetails: req.usdtDetails,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.push(doc);
  console.log('Created:', doc.referenceId, req.method, req.amount);
}

console.log(`\nDone — ${created.length} withdrawal request(s) ready for /invest`);
await mongoose.disconnect();
