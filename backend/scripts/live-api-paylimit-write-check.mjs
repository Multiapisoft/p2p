#!/usr/bin/env node
/**
 * Live write smoke: add ₹1 pay limit then deduct ₹1; verify remaining + ledger.
 */
const BASE = process.env.P2P_API_BASE || 'https://dev.payment.fairplayoffical.com/api/v1';
const EMAIL = process.env.P2P_ADMIN_EMAIL || 'admin@p2p.local';
const PASS = process.env.P2P_ADMIN_PASSWORD || 'Admin@123456';
const BIZ_NAME = process.env.P2P_TEST_BIZ || 'TestingBusiness';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status} ${json.message || JSON.stringify(json)}`);
  }
  return json.data ?? json;
}

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function main() {
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  const token = login.accessToken;
  console.log('LOGIN ok', login.user.email);

  const bizPage = await api('/business?limit=50', { token });
  const biz = (bizPage.items || []).find((b) => b.name === BIZ_NAME);
  if (!biz) throw new Error(`Business not found: ${BIZ_NAME}`);
  const id = biz._id || biz.id;
  console.log('BIZ', biz.name, id);

  const before = await api(`/commissions/business/${id}`, { token });
  const remBefore = round(before.p2pPayRemaining);
  console.log('BEFORE', {
    limit: before.p2pPayLimit,
    earned: before.p2pPayEarned,
    used: before.p2pPayUsed,
    rem: remBefore,
  });

  await api(`/business/${id}/p2p-pay-limit`, {
    method: 'PATCH',
    token,
    body: { p2pPayLimit: 1, mode: 'add' },
  });
  const afterAdd = await api(`/commissions/business/${id}`, { token });
  const remAfterAdd = round(afterAdd.p2pPayRemaining);
  const addOk = remAfterAdd === round(remBefore + 1);
  console.log(addOk ? 'PASS' : 'FAIL', `add +1 rem ${remBefore} → ${remAfterAdd}`);

  await api(`/business/${id}/p2p-pay-limit`, {
    method: 'PATCH',
    token,
    body: { p2pPayLimit: 1, mode: 'deduct' },
  });
  const afterDeduct = await api(`/commissions/business/${id}`, { token });
  const remAfterDeduct = round(afterDeduct.p2pPayRemaining);
  const deductOk = remAfterDeduct === remBefore;
  console.log(deductOk ? 'PASS' : 'FAIL', `deduct −1 rem back ${remAfterDeduct} (want ${remBefore})`);

  const ledger = await api(
    `/transactions/admin/all?limit=20&type=p2p_limit&userId=${biz.ownerId}`,
    { token },
  );
  const rows = ledger.items || [];
  const recent = rows.slice(0, 5).map((r) => ({
    amount: r.amount,
    dir: r.direction,
    balAfter: r.balanceAfter,
    desc: (r.description || '').slice(0, 90),
  }));
  console.log('LEDGER recent p2p_limit for owner:');
  for (const r of recent) console.log(' ', JSON.stringify(r));

  const hasAddRow = rows.some((r) => /pay limit added ₹1/i.test(r.description || ''));
  console.log(hasAddRow ? 'PASS' : 'FAIL', 'ledger contains pay limit added ₹1');

  const ok = addOk && deductOk && hasAddRow;
  console.log(ok ? '\nRESULT: WRITE ROUNDTRIP PASSED' : '\nRESULT: WRITE ROUNDTRIP FAILED');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR', e.message || e);
  process.exit(1);
});
