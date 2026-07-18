/**
 * One-off: recreate Bitfarm business + sync keys into bitfarming/.env
 * Run: node scripts/seed-bitfarm-business.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/p2p_platform';
const PARTNER_BASE = process.env.PARTNER_BASE || 'http://localhost:47754';
const OWNER_EMAIL = process.env.BUSINESS_OWNER_EMAIL || 'business@bitfarm.local';
const OWNER_PASSWORD = process.env.BUSINESS_OWNER_PASSWORD || 'Business@123456';
const BITFARMING_ENV = path.resolve(__dirname, '../../../bitfarming/server/.env');

function expandPartner(baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  const prefix = `${base}/api/p2p/partner`;
  return {
    baseUrl: base,
    balanceUrl: `${prefix}/balance`,
    creditUrl: `${prefix}/credit`,
    debitUrl: `${prefix}/debit`,
  };
}

function patchEnv(filePath, updates) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, line);
    else text = `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(filePath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const users = db.collection('users');
  const businesses = db.collection('businesses');

  let owner = await users.findOne({ email: OWNER_EMAIL });
  if (!owner) {
    const hashed = await bcrypt.hash(OWNER_PASSWORD, 12);
    const inserted = await users.insertOne({
      email: OWNER_EMAIL,
      password: hashed,
      name: 'Bitfarm Business',
      role: 'business',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    owner = await users.findOne({ _id: inserted.insertedId });
    console.log('Created business owner:', OWNER_EMAIL, OWNER_PASSWORD);
  } else {
    await users.updateOne(
      { _id: owner._id },
      { $set: { role: 'business', status: 'active', updatedAt: new Date() } },
    );
    console.log('Using existing owner:', OWNER_EMAIL);
  }

  // Wipe stale businesses (keys were orphaned)
  await businesses.deleteMany({});

  const apiKey = `pk_${uuidv4().replace(/-/g, '')}`;
  const apiSecret = `sk_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '')}`;
  const apiSecretHash = await bcrypt.hash(apiSecret, 12);
  const internalSecret = `is_${uuidv4().replace(/-/g, '')}${uuidv4().slice(0, 8)}`;
  const internalSecretHash = await bcrypt.hash(internalSecret, 12);
  const partner = expandPartner(PARTNER_BASE);
  const slug = 'bitfarm';
  const referralCode = `ref_${slug}_${uuidv4().slice(0, 8)}`;

  const bizInsert = await businesses.insertOne({
    ownerId: owner._id,
    name: 'Bitfarm',
    slug,
    apiKey,
    apiSecretHash,
    internalSecretHash,
    referralCode,
    partnerApi: {
      ...partner,
      apiKey,
      apiSecret,
    },
    integrationUrls: {
      partnerSiteUrl: PARTNER_BASE,
      returnUrl: PARTNER_BASE,
    },
    commissionRate: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalUsers: 0,
    totalCommissionEarned: 0,
    allowedPaymentMethods: ['upi', 'bank', 'usdt'],
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('Business created:', String(bizInsert.insertedId));

  // Link existing Bitfarming test user if present
  const externalRef = 'bitfarming:699d9e55d32eb272a204e875';
  const linked = await users.findOneAndUpdate(
    { email: 'dev@gmail.com' },
    {
      $set: {
        referredByBusiness: bizInsert.insertedId,
        externalRef,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  if (linked) {
    console.log('Linked user dev@gmail.com → business +', externalRef);
  }

  const creds = {
    P2P_API_URL: 'http://localhost:9091/api/v1',
    P2P_API_KEY: apiKey,
    P2P_API_SECRET: apiSecret,
    P2P_INTERNAL_SECRET: internalSecret,
  };

  if (fs.existsSync(BITFARMING_ENV)) {
    patchEnv(BITFARMING_ENV, creds);
    console.log('Updated', BITFARMING_ENV);
  } else {
    console.warn('Bitfarming .env not found at', BITFARMING_ENV);
  }

  console.log('\n=== Paste into Bitfarming server .env ===');
  for (const [k, v] of Object.entries(creds)) console.log(`${k}=${v}`);
  console.log('========================================\n');

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
