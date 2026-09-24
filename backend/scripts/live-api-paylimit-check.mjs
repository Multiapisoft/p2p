#!/usr/bin/env node
/**
 * Live API smoke: pay-limit remaining vs open business WD holds + ledger rows.
 * Usage: node scripts/live-api-paylimit-check.mjs
 */
const BASE = process.env.P2P_API_BASE || 'https://dev.payment.fairplayoffical.com/api/v1';
const EMAIL = process.env.P2P_ADMIN_EMAIL || 'admin@p2p.local';
const PASS = process.env.P2P_ADMIN_PASSWORD || 'Admin@123456';

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

function rem(limit, earned, used, hold) {
  return Math.round(Math.max(0, (limit || 0) + (earned || 0) - (used || 0) - (hold || 0)) * 100) / 100;
}

async function main() {
  const report = { ok: true, checks: [] };
  const push = (name, pass, detail) => {
    report.checks.push({ name, pass, detail });
    if (!pass) report.ok = false;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const health = await api('/health');
  push('health', health.status === 'ok', `mongo=${health.info?.mongodb?.status} redis=${health.info?.redis?.status}`);

  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  const token = login.accessToken;
  push('admin login', !!token, login.user?.email);

  const bizPage = await api('/business?limit=50', { token });
  const businesses = bizPage.items || bizPage || [];
  push('list businesses', Array.isArray(businesses) && businesses.length > 0, `count=${businesses.length}`);

  let matched = 0;
  let mismatch = 0;
  for (const b of businesses.slice(0, 20)) {
    const id = b.id || b._id;
    const commissions = await api(`/commissions/business/${id}`, { token });
    const limit = Number(commissions.p2pPayLimit ?? b.p2pPayLimit) || 0;
    const earned = Number(commissions.p2pPayEarned ?? b.p2pPayEarned) || 0;
    const used = Number(commissions.p2pPayUsed ?? b.p2pPayUsed) || 0;
    const apiRem = Number(commissions.p2pPayRemaining);
    const listRem = Number(b.p2pPayRemaining);
    // Open business-origin WDs aren't returned on commissions — remaining must be ≤ cap-used
    const withoutHold = rem(limit, earned, used, 0);
    const holdImplied = Math.round((withoutHold - apiRem) * 100) / 100;
    if (Number.isFinite(listRem) && Math.abs(listRem - apiRem) > 0.01) {
      mismatch++;
      push(
        `list vs commission rem ${b.name || id}`,
        false,
        `list=${listRem} commission=${apiRem}`,
      );
    } else if (apiRem > withoutHold + 0.01) {
      mismatch++;
      push(
        `remaining ${b.name || id}`,
        false,
        `apiRem=${apiRem} > seed+earned-used=${withoutHold}`,
      );
    } else {
      matched++;
      console.log(
        `  INFO  ${b.name || id}: rem=${apiRem} hold≈${Math.max(0, holdImplied)} limit=${limit} earned=${earned} used=${used}`,
      );
    }
  }
  push(
    'commission remaining ≤ cap−used (hold-aware)',
    mismatch === 0,
    `checked=${matched + mismatch} ok=${matched}`,
  );

  // Admin ledger: look for p2p_limit rows with hold/fee/reset wording
  const ledger = await api('/transactions/admin/all?limit=100&type=p2p_limit', { token });
  const rows = ledger.items || [];
  const texts = rows.map((r) => r.description || '').join('\n');
  push('admin p2p_limit ledger readable', Array.isArray(rows), `rows=${rows.length}`);
  const hasHold = /pay limit held/i.test(texts);
  const hasFee = /withdrawal fee to admin/i.test(texts);
  const hasReset = /pay limit reset/i.test(texts);
  const hasAdd = /pay limit added/i.test(texts);
  console.log(
    `  INFO  ledger signals: hold=${hasHold} fee=${hasFee} reset=${hasReset} add=${hasAdd}`,
  );

  const sample = businesses.find((b) => Number(b.p2pPayRemaining ?? b.p2pPayLimit) > 0) || businesses[0];
  if (sample) {
    const sid = sample.id || sample._id;
    const stats = await api(`/business/${sid}/stats`, { token }).catch((e) => ({ error: e.message }));
    push('business stats', !stats.error, stats.error || `id=${sid}`);
  }

  console.log(report.ok ? '\nRESULT: ALL CHECKS PASSED' : '\nRESULT: SOME CHECKS FAILED');
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR', e.message || e);
  process.exit(1);
});
