const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const BITFARMING_ENV = path.resolve(__dirname, '../../../bitfarming/server/.env');

function patchEnv(filePath, updates) {
  let text = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, line);
    else text = `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(filePath, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

(async () => {
  await mongoose.connect('mongodb://localhost:27017/p2p_platform');
  const internalSecret = `is_${uuidv4().replace(/-/g, '')}${uuidv4().replace(/-/g, '').slice(0, 8)}`;
  const internalSecretHash = await bcrypt.hash(internalSecret, 12);

  const ok = await bcrypt.compare(internalSecret, internalSecretHash);
  if (!ok) throw new Error('hash self-check failed');

  await mongoose.connection.db.collection('businesses').updateOne(
    { slug: 'bitfarm' },
    { $set: { internalSecretHash, updatedAt: new Date() } },
  );

  patchEnv(BITFARMING_ENV, { P2P_INTERNAL_SECRET: internalSecret });

  const verify = await bcrypt.compare(
    internalSecret,
    (await mongoose.connection.db.collection('businesses').findOne({ slug: 'bitfarm' }))
      .internalSecretHash,
  );
  console.log('DB+env sync ok:', verify);
  console.log('P2P_INTERNAL_SECRET=' + internalSecret);

  const key = 'pk_7141bd86bb4949128a99a1cf809b2fa8';
  const secret = 'sk_34f2902480fa480d901f7d17ce59feff3ce9cf6a0c7347ae94875f2535e14d7f';
  const res = await fetch(
    'http://127.0.0.1:9091/api/v1/integration/users/lookup?email=dev%40gmail.com',
    {
      headers: {
        'x-api-key': key,
        'x-api-secret': secret,
        'x-internal-secret': internalSecret,
      },
    },
  );
  console.log('lookup', res.status, await res.text());

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
