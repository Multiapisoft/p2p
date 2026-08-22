/**
 * Reset platform admin password from backend/.env (ADMIN_EMAIL / ADMIN_PASSWORD).
 * Run: node scripts/reset-admin-password.js
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

loadEnv(path.resolve(__dirname, '../.env'));

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is missing (set in backend/.env)');
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL || 'admin@p2p.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const name = process.env.ADMIN_NAME || 'Super Admin';

  await mongoose.connect(uri);
  const users = mongoose.connection.db.collection('users');
  const hash = await bcrypt.hash(password, 12);

  let result = await users.updateOne(
    { email },
    {
      $set: {
        password: hash,
        name,
        role: 'admin',
        status: 'active',
        updatedAt: new Date(),
      },
    },
  );

  if (result.matchedCount === 0) {
    await users.insertOne({
      email,
      password: hash,
      name,
      role: 'admin',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created admin: ${email}`);
  } else {
    console.log(`Updated admin password: ${email} (modified=${result.modifiedCount})`);
  }

  const ok = await bcrypt.compare(password, hash);
  console.log('Password hash self-check:', ok ? 'ok' : 'failed');
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
