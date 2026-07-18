'use client';

import { useCallback, useEffect, useState } from 'react';
import { p2pApi, P2pApiError } from '@/lib/p2p-api';
import { PartnerSiteSimulator } from '@/components/PartnerSiteSimulator';
import type { ApiCredentials, Deposit, FlowLog, IntegrationUser, VerifyResponse, WebhookEvent } from '@/lib/types';

const STORAGE_KEY = 'p2p-integration-creds';

function loadCreds(): ApiCredentials {
  if (typeof window === 'undefined') {
    return {
      apiKey: '',
      apiSecret: '',
      internalSecret: '',
      baseUrl: '/api/v1',
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ApiCredentials & { internalKey?: string };
      const { internalKey: _removed, ...rest } = parsed;
      return { internalSecret: '', ...rest };
    }
  } catch {
    /* ignore */
  }
  return {
    apiKey: process.env.NEXT_PUBLIC_DEFAULT_API_KEY || '',
    apiSecret: process.env.NEXT_PUBLIC_DEFAULT_API_SECRET || '',
    internalSecret: process.env.NEXT_PUBLIC_DEFAULT_INTERNAL_SECRET || '',
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1',
  };
}

function saveCreds(creds: ApiCredentials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

function logId() {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function IntegrationTester() {
  const [creds, setCreds] = useState<ApiCredentials>(loadCreds);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [users, setUsers] = useState<IntegrationUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [lastDeposit, setLastDeposit] = useState<Deposit | null>(null);
  const [depositRef, setDepositRef] = useState('');
  const [depositLookup, setDepositLookup] = useState<Deposit | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [logs, setLogs] = useState<FlowLog[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [callbackInfo, setCallbackInfo] = useState<Record<string, string> | null>(null);

  const [regForm, setRegForm] = useState({
    name: 'Test User',
    email: `user${Date.now()}@integration.test`,
    password: 'Test@123456',
    phone: '+919876543210',
    externalRef: `ext_${Date.now()}`,
  });

  const [redirectAmount, setRedirectAmount] = useState('500');
  const [lastRedirectUrl, setLastRedirectUrl] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<{
    availableBalance: number;
    balance: number;
    lockedBalance: number;
  } | null>(null);
  const [cancelRef, setCancelRef] = useState('');

  const returnUrl =
    typeof window !== 'undefined' ? `${window.location.origin}?integration=callback` : '';

  const [depForm, setDepForm] = useState({
    amount: '500',
    method: 'upi' as 'upi' | 'bank' | 'usdt',
    upiId: 'test@upi',
    payerName: 'Test Payer',
    externalRef: `dep_${Date.now()}`,
  });

  const addLog = useCallback((step: string, status: FlowLog['status'], message: string, data?: unknown) => {
    setLogs((prev) => [
      {
        id: logId(),
        time: new Date().toLocaleTimeString(),
        step,
        status,
        message,
        data,
      },
      ...prev,
    ]);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('integration') !== 'callback') return;
    const info: Record<string, string> = {};
    ['status', 'type', 'referenceId', 'amount'].forEach((k) => {
      const v = params.get(k);
      if (v) info[k] = v;
    });
    if (Object.keys(info).length) {
      setCallbackInfo(info);
      addLog(
        'Partner Callback',
        'success',
        `User returned: ${info.type || 'transaction'} ${info.status || ''} · ref ${info.referenceId || '—'}`,
        info,
      );
    }
  }, [addLog]);

  const run = useCallback(
    async (step: string, fn: () => Promise<void>) => {
      setLoading(step);
      try {
        await fn();
      } catch (err) {
        const msg = err instanceof P2pApiError ? err.message : 'Unexpected error';
        addLog(step, 'error', msg, err instanceof P2pApiError ? err.body : undefined);
      } finally {
        setLoading(null);
      }
    },
    [addLog],
  );

  const refreshWebhooks = useCallback(async () => {
    const res = await fetch('/api/webhook');
    const data = (await res.json()) as { events: WebhookEvent[] };
    setWebhooks(data.events);
  }, []);

  useEffect(() => {
    refreshWebhooks();
    const t = setInterval(refreshWebhooks, 5000);
    return () => clearInterval(t);
  }, [refreshWebhooks]);

  const handleSaveCreds = () => {
    saveCreds(creds);
    addLog('Config', 'success', 'Credentials saved to browser storage');
  };

  const handleVerify = () =>
    run('Verify', async () => {
      const res = await p2pApi.verify(creds);
      setVerify(res);
      addLog('Verify', 'success', `Connected to business: ${res.name}`, res);
    });

  const handleListUsers = () =>
    run('List Users', async () => {
      const res = await p2pApi.listUsers(creds);
      setUsers(res.items);
      if (res.items[0] && !selectedUserId) setSelectedUserId(res.items[0]._id);
      addLog('List Users', 'success', `Found ${res.total} user(s)`, res);
    });

  const handleRegisterUser = () =>
    run('Register User', async () => {
      const res = await p2pApi.registerUser(creds, regForm);
      const user = res.user;
      setUsers((prev) => [user, ...prev.filter((u) => u._id !== user._id)]);
      setSelectedUserId(res.userId || user._id);
      addLog(
        'Register User',
        'success',
        `Created user ${user.email} · FinGuard ID ${res.userId}`,
        res,
      );
    });

  const handleCreateDeposit = () =>
    run('Create Deposit', async () => {
      if (!selectedUserId) throw new P2pApiError('Select a user first');
      const amount = Number(depForm.amount);
      if (!amount || amount < 1) throw new P2pApiError('Invalid amount');

      const deposit = await p2pApi.createDeposit(creds, {
        userId: selectedUserId,
        amount,
        method: depForm.method,
        externalRef: depForm.externalRef,
        upiDetails:
          depForm.method === 'upi'
            ? { upiId: depForm.upiId, payerName: depForm.payerName }
            : undefined,
        bankDetails:
          depForm.method === 'bank'
            ? {
                accountNumber: '1234567890',
                ifscCode: 'HDFC0001234',
                accountHolderName: 'Test User',
              }
            : undefined,
        usdtDetails:
          depForm.method === 'usdt'
            ? { walletAddress: 'TXyz1234567890abcdef', network: 'TRC20' }
            : undefined,
      });

      setLastDeposit(deposit);
      setDepositRef(deposit.referenceId);
      addLog('Create Deposit', 'success', `Deposit ${deposit.referenceId} created (pending)`, deposit);
    });

  const handleLookupDeposit = () =>
    run('Get Deposit', async () => {
      if (!depositRef.trim()) throw new P2pApiError('Enter a reference ID');
      const deposit = await p2pApi.getDeposit(creds, depositRef.trim());
      setDepositLookup(deposit);
      addLog('Get Deposit', 'success', `Status: ${deposit.status}`, deposit);
    });

  const handleTestWebhook = () =>
    run('Test Webhook', async () => {
      const res = await p2pApi.testWebhook(creds);
      addLog('Test Webhook', 'success', res.message || 'Webhook test sent', res);
      setTimeout(refreshWebhooks, 1000);
    });

  const handleRedirectDeposit = () =>
    run('Redirect Deposit', async () => {
      if (!selectedUserId) throw new P2pApiError('Select a user first');
      const amount = Number(redirectAmount);
      if (!amount || amount < 1) throw new P2pApiError('Invalid amount');
      const res = await p2pApi.createDepositRedirect(creds, {
        userId: selectedUserId,
        amount,
        returnUrl,
        externalRef: `redirect_dep_${Date.now()}`,
      });
      setLastRedirectUrl(res.redirectUrl);
      addLog('Redirect Deposit', 'success', 'Opening user panel…', res);
      window.open(res.redirectUrl, '_blank');
    });

  const handleRedirectWithdrawal = () =>
    run('Redirect Withdrawal', async () => {
      if (!selectedUserId) throw new P2pApiError('Select a user first');
      const amount = Number(redirectAmount);
      if (!amount || amount < 1) throw new P2pApiError('Invalid amount');
      const res = await p2pApi.createWithdrawalRedirect(creds, {
        userId: selectedUserId,
        amount,
        returnUrl,
        externalRef: `redirect_wdr_${Date.now()}`,
      });
      setLastRedirectUrl(res.redirectUrl);
      addLog('Redirect Withdrawal', 'success', 'Opening user panel…', res);
      window.open(res.redirectUrl, '_blank');
    });

  const handleFetchBalance = () =>
    run('Fetch Balance', async () => {
      if (!selectedUserId) throw new P2pApiError('Select a user first');
      const res = await p2pApi.getUserBalance(creds, selectedUserId);
      setUserBalance(res);
      addLog('Fetch Balance', 'success', `Available: ₹${res.availableBalance}`, res);
    });

  const handleCreditUser = () =>
    run('Credit User', async () => {
      if (!selectedUserId) throw new P2pApiError('Select a user first');
      const amount = Number(redirectAmount);
      if (!amount || amount < 1) throw new P2pApiError('Invalid amount');
      const res = await p2pApi.creditUser(creds, selectedUserId, { amount });
      setUserBalance(res);
      addLog('Credit User', 'success', `Credited ₹${amount}`, res);
    });

  const handleDebitUser = () =>
    run('Debit User', async () => {
      if (!selectedUserId) throw new P2pApiError('Select a user first');
      const amount = Number(redirectAmount);
      if (!amount || amount < 1) throw new P2pApiError('Invalid amount');
      const res = await p2pApi.debitUser(creds, selectedUserId, { amount });
      setUserBalance(res);
      addLog('Debit User', 'success', `Debited ₹${amount}`, res);
    });

  const handleCancelDeposit = () =>
    run('Cancel Deposit', async () => {
      if (!cancelRef) throw new P2pApiError('Enter reference ID');
      const res = await p2pApi.cancelDeposit(creds, cancelRef);
      addLog('Cancel Deposit', 'success', `Cancelled ${cancelRef}`, res);
      setCancelRef('');
    });

  const handleCancelWithdrawal = () =>
    run('Cancel Withdrawal', async () => {
      if (!cancelRef) throw new P2pApiError('Enter reference ID');
      const res = await p2pApi.cancelWithdrawal(creds, cancelRef);
      addLog('Cancel Withdrawal', 'success', `Cancelled ${cancelRef}`, res);
      setCancelRef('');
    });

  const webhookUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/webhook` : 'http://localhost:5177/api/webhook';

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <p className="text-sm font-medium text-emerald-600">P2P Platform — Integration Demo</p>
        <h1 className="text-3xl font-bold tracking-tight">Business API Flow Tester</h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Simulate a third-party app integrating with a business account: verify credentials, register
          users, create deposits, and receive webhooks.
        </p>
      </header>

      {callbackInfo && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
          <strong>User returned from FinGuard:</strong>{' '}
          {callbackInfo.type} · status {callbackInfo.status} · ref {callbackInfo.referenceId} · ₹
          {callbackInfo.amount}
        </div>
      )}

      {/* Credentials */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-lg font-semibold">1. API Credentials</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Get keys from the Business panel → Integration. Business must be{' '}
          <strong>approved by admin</strong> before API calls work.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">API Base URL</span>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={creds.baseUrl}
              onChange={(e) => setCreds({ ...creds, baseUrl: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">API Key</span>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={creds.apiKey}
              onChange={(e) => setCreds({ ...creds, apiKey: e.target.value })}
              placeholder="pk_..."
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium">API Secret</span>
            <input
              type="password"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={creds.apiSecret}
              onChange={(e) => setCreds({ ...creds, apiSecret: e.target.value })}
              placeholder="sk_..."
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Internal Secret (wallet ops)</span>
            <input
              type="password"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={creds.internalSecret}
              onChange={(e) => setCreds({ ...creds, internalSecret: e.target.value })}
              placeholder="is_..."
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Wallet ops need 3 headers: API Key, API Secret, Internal Secret. Server-side only on partner
          site.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSaveCreds}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save Credentials
          </button>
          <button
            type="button"
            disabled={loading === 'Verify'}
            onClick={handleVerify}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading === 'Verify' ? 'Verifying…' : 'Verify Connection'}
          </button>
        </div>
        {verify && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">✓ {verify.name}</p>
            <p className="mt-1 text-emerald-700 dark:text-emerald-400">
              Business ID: {verify.businessId} · Methods: {verify.allowedPaymentMethods.join(', ')}
            </p>
            {verify.referralCode && (
              <p className="text-emerald-700 dark:text-emerald-400">Referral: {verify.referralCode}</p>
            )}
          </div>
        )}
      </section>

      <PartnerSiteSimulator
        creds={creds}
        loading={loading}
        setLoading={setLoading}
        onLog={(step, status, message, data) => addLog(step, status, message, data)}
      />

      {/* Users */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-lg font-semibold">2. Users (via Business API)</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium">Register new user</p>
            {(['name', 'email', 'password', 'phone', 'externalRef'] as const).map((field) => (
              <input
                key={field}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder={field}
                value={regForm[field]}
                onChange={(e) => setRegForm({ ...regForm, [field]: e.target.value })}
              />
            ))}
            <button
              type="button"
              disabled={!!loading}
              onClick={handleRegisterUser}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading === 'Register User' ? 'Registering…' : 'POST /integration/users'}
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Registered users</p>
              <button
                type="button"
                disabled={!!loading}
                onClick={handleListUsers}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Refresh list
              </button>
            </div>
            {users.length === 0 ? (
              <p className="text-sm text-zinc-500">No users yet — register one or refresh.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {users.map((u) => (
                  <li key={u._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(u._id)}
                      className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                        selectedUserId === u._id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      <p className="font-medium">{u.name}</p>
                      <p className="text-zinc-500">{u.email}</p>
                      <p className="mt-1 font-mono text-xs text-zinc-400">{u._id}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Redirect to User Panel */}
      <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-6 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
        <h2 className="mb-2 text-lg font-semibold">3. Redirect to FinGuard User Panel</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          User is sent to <strong>http://localhost:5174</strong> to complete deposit/withdrawal.
          Amount is locked/deducted from your business wallet automatically.
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount (₹)</span>
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              value={redirectAmount}
              onChange={(e) => setRedirectAmount(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!!loading || !selectedUserId}
            onClick={handleRedirectDeposit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Redirect → Deposit
          </button>
          <button
            type="button"
            disabled={!!loading || !selectedUserId}
            onClick={handleRedirectWithdrawal}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Redirect → Withdrawal
          </button>
        </div>
        {lastRedirectUrl && (
          <p className="text-xs text-zinc-500">
            Last URL:{' '}
            <a href={lastRedirectUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
              {lastRedirectUrl}
            </a>
          </p>
        )}

        <div className="mt-6 border-t border-emerald-200 pt-4 dark:border-emerald-900">
          <p className="mb-2 text-sm font-semibold">Wallet Actions</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!loading || !selectedUserId}
              onClick={handleFetchBalance}
              className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50 dark:text-emerald-400"
            >
              Fetch Balance
            </button>
            <button
              type="button"
              disabled={!!loading || !selectedUserId}
              onClick={handleCreditUser}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Credit
            </button>
            <button
              type="button"
              disabled={!!loading || !selectedUserId}
              onClick={handleDebitUser}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Debit
            </button>
          </div>
          {userBalance && (
            <p className="mb-3 text-sm">
              Available: <strong>₹{userBalance.availableBalance}</strong> · Total: ₹
              {userBalance.balance} · Locked: ₹{userBalance.lockedBalance}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="DEP-... or WDR-... ref"
              value={cancelRef}
              onChange={(e) => setCancelRef(e.target.value)}
            />
            <button
              type="button"
              disabled={!!loading || !cancelRef}
              onClick={handleCancelDeposit}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Cancel Deposit
            </button>
            <button
              type="button"
              disabled={!!loading || !cancelRef}
              onClick={handleCancelWithdrawal}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Cancel Withdrawal
            </button>
          </div>
        </div>
      </section>

      {/* Deposits API (direct) */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-lg font-semibold">4. Deposits (API direct)</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Selected user:{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            {selectedUserId || 'none'}
          </code>
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Amount"
            value={depForm.amount}
            onChange={(e) => setDepForm({ ...depForm, amount: e.target.value })}
          />
          <select
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={depForm.method}
            onChange={(e) =>
              setDepForm({ ...depForm, method: e.target.value as 'upi' | 'bank' | 'usdt' })
            }
          >
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="usdt">USDT</option>
          </select>
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="External ref"
            value={depForm.externalRef}
            onChange={(e) => setDepForm({ ...depForm, externalRef: e.target.value })}
          />
        </div>
        {depForm.method === 'upi' && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="UPI ID"
              value={depForm.upiId}
              onChange={(e) => setDepForm({ ...depForm, upiId: e.target.value })}
            />
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Payer name"
              value={depForm.payerName}
              onChange={(e) => setDepForm({ ...depForm, payerName: e.target.value })}
            />
          </div>
        )}
        <button
          type="button"
          disabled={!!loading || !selectedUserId}
          onClick={handleCreateDeposit}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading === 'Create Deposit' ? 'Creating…' : 'POST /deposits/integration'}
        </button>
        {lastDeposit && (
          <div className="mt-4 rounded-lg bg-violet-50 p-4 text-sm dark:bg-violet-950/30">
            <p className="font-semibold">Last deposit: {lastDeposit.referenceId}</p>
            <p>
              ₹{lastDeposit.amount} · {lastDeposit.status} · approve in Admin panel
            </p>
          </div>
        )}
        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="mb-2 text-sm font-medium">Lookup deposit by reference</p>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={depositRef}
              onChange={(e) => setDepositRef(e.target.value)}
              placeholder="DEP-..."
            />
            <button
              type="button"
              disabled={!!loading}
              onClick={handleLookupDeposit}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              GET
            </button>
          </div>
          {depositLookup && (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
              {JSON.stringify(depositLookup, null, 2)}
            </pre>
          )}
        </div>
      </section>

      {/* Webhooks */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-lg font-semibold">5. Webhooks</h2>
        <p className="mb-2 text-sm text-zinc-500">
          Set this URL in Business Profile → Webhook URL:
        </p>
        <code className="block rounded-lg bg-zinc-100 p-3 font-mono text-sm break-all dark:bg-zinc-900">
          {webhookUrl}
        </code>
        <button
          type="button"
          disabled={!!loading}
          onClick={handleTestWebhook}
          className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading === 'Test Webhook' ? 'Sending…' : 'Send test webhook from platform'}
        </button>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Received events ({webhooks.length})</p>
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/webhook', { method: 'DELETE' });
                refreshWebhooks();
              }}
              className="text-xs text-zinc-500 hover:underline"
            >
              Clear
            </button>
          </div>
          {webhooks.length === 0 ? (
            <p className="text-sm text-zinc-500">No webhooks received yet.</p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {webhooks.map((w) => (
                <li key={w.id} className="rounded-lg border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{w.event}</span>
                  <span className="ml-2 text-zinc-400">{w.receivedAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Flow log */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Flow Log</h2>
          <button type="button" onClick={() => setLogs([])} className="text-sm text-zinc-500 hover:underline">
            Clear
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">Run steps above to see the integration flow log.</p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto font-mono text-xs">
            {logs.map((l) => (
              <li
                key={l.id}
                className={`rounded-lg border p-3 ${
                  l.status === 'error'
                    ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
                    : l.status === 'success'
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
                      : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <span className="text-zinc-400">{l.time}</span>{' '}
                <span className="font-semibold">[{l.step}]</span> {l.message}
                {l.data != null && (
                  <pre className="mt-2 overflow-x-auto text-[10px] opacity-80">
                    {JSON.stringify(l.data, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick start */}
      <section className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">P2P pay test (2 users)</h2>
        <p className="mb-3">
          FinGuard hides your <em>own</em> withdrawals on <code>/deposits</code>. You need two
          different users.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Register / use <strong>User A</strong> (withdrawer) — e.g. <code>dev1@gmail.com</code>
          </li>
          <li>Partner simulator → login as A → Credit → Withdraw (creates open request)</li>
          <li>
            Register / use <strong>User B</strong> (depositor) — e.g. <code>dev2@gmail.com</code> /
            <code>Test@123</code>
          </li>
          <li>
            Partner simulator → login as B → <strong>Deposit (Pay requests)</strong> → opens{' '}
            <code>http://localhost:5174/deposits</code>
          </li>
          <li>User B pays User A’s open withdrawal → after verify, B gets deposit + partner credit</li>
        </ol>
        <p className="mt-3 text-xs">
          Or login directly on 5174: logout from A, login as B (<code>dev2@gmail.com</code> /{' '}
          <code>Test@123</code>), open Deposits → Pay requests.
        </p>
      </section>
    </div>
  );
}
