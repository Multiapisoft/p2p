/**
 * Drop the MongoDB database and re-create only the platform admin
 * (from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME).
 *
 * Usage (local):
 *   node scripts/reset-db-keep-admin.js
 *
 * Usage (VPS container — loads .env.production via compose env):
 *   docker exec -w /app p2p-backend node scripts/reset-db-keep-admin.js
 *
 * WARNING: destructive — all collections are wiped.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.resolve(__dirname, '../.env.production'));
loadEnv(path.resolve(__dirname, '../.env'));

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is missing');
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL || 'admin@p2p.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const name = process.env.ADMIN_NAME || 'Super Admin';

  console.log('Connecting…');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  console.log(`Dropping database: ${dbName}`);
  await db.dropDatabase();

  const hash = await bcrypt.hash(password, 12);
  const now = new Date();
  await db.collection('users').insertOne({
    email,
    password: hash,
    name,
    role: 'admin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  const count = await db.collection('users').countDocuments();
  console.log(`Admin seeded: ${email} (users=${count})`);
  console.log('Password hash self-check:', (await bcrypt.compare(password, hash)) ? 'ok' : 'failed');
  await mongoose.disconnect();
  console.log('Done. Restart backend so default commissions / payment configs re-seed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
