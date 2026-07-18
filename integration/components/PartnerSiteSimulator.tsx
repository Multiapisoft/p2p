'use client';

import { useState } from 'react';
import { p2pApi, P2pApiError } from '@/lib/p2p-api';
import type { ApiCredentials } from '@/lib/types';

interface PartnerSiteSimulatorProps {
  creds: ApiCredentials;
  onLog: (step: string, status: 'success' | 'error', message: string, data?: unknown) => void;
  loading: boolean;
  setLoading: (v: string | null) => void;
}

export function PartnerSiteSimulator({ creds, onLog, loading, setLoading }: PartnerSiteSimulatorProps) {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('500');
  const [loggedIn, setLoggedIn] = useState<{
    userId: string;
    name: string;
    email: string;
    availableBalance: number;
  } | null>(null);

  const run = async (step: string, fn: () => Promise<void>) => {
    setLoading(step);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof P2pApiError ? err.message : 'Error';
      onLog(step, 'error', msg);
    } finally {
      setLoading(null);
    }
  };

  const handleLogin = () =>
    run('Partner Login', async () => {
      if (!email.trim()) throw new P2pApiError('Enter user email');
      const res = await p2pApi.lookupUser(creds, email.trim());
      const userId = String((res.user as { _id?: string; id?: string })._id || res.user.id || '');
      setLoggedIn({
        userId,
        name: res.user.name,
        email: res.user.email,
        availableBalance: res.balance.availableBalance,
      });
      onLog('Partner Login', 'success', `Welcome ${res.user.name} · ₹${res.balance.availableBalance}`, res);
    });

  const refreshBalance = () =>
    run('Refresh Balance', async () => {
      if (!loggedIn) return;
      const bal = await p2pApi.getUserBalance(creds, loggedIn.userId);
      setLoggedIn((prev) => prev && { ...prev, availableBalance: bal.availableBalance });
      onLog('Refresh Balance', 'success', `₹${bal.availableBalance}`, bal);
    });

  const handleDeposit = () =>
    run('Partner Deposit', async () => {
      if (!loggedIn) throw new P2pApiError('Login first');
      const res = await p2pApi.createDepositRedirect(creds, {
        userId: loggedIn.userId,
        amount: Number(amount),
        returnUrl: typeof window !== 'undefined' ? `${window.location.origin}?integration=callback` : undefined,
      });
      window.open(res.redirectUrl, '_blank');
      onLog(
        'Partner Deposit',
        'success',
        'Opened FinGuard /deposits — pay another user’s open withdrawal',
        res,
      );
    });

  const handleWithdrawal = () =>
    run('Partner Withdrawal', async () => {
      if (!loggedIn) throw new P2pApiError('Login first');
      const res = await p2pApi.createWithdrawalRedirect(creds, {
        userId: loggedIn.userId,
        amount: Number(amount),
        returnUrl: typeof window !== 'undefined' ? `${window.location.origin}?integration=callback` : undefined,
      });
      window.open(res.redirectUrl, '_blank');
      onLog('Partner Withdrawal', 'success', 'Opened FinGuard withdrawal', res);
    });

  const handleCredit = () =>
    run('Partner Credit', async () => {
      if (!loggedIn) throw new P2pApiError('Login first');
      const res = await p2pApi.creditUser(creds, loggedIn.userId, { amount: Number(amount) });
      setLoggedIn((prev) => prev && { ...prev, availableBalance: res.availableBalance });
      onLog('Partner Credit', 'success', `Credited ₹${amount}`, res);
    });

  const handleDebit = () =>
    run('Partner Debit', async () => {
      if (!loggedIn) throw new P2pApiError('Login first');
      const res = await p2pApi.debitUser(creds, loggedIn.userId, { amount: Number(amount) });
      setLoggedIn((prev) => prev && { ...prev, availableBalance: res.availableBalance });
      onLog('Partner Debit', 'success', `Debited ₹${amount}`, res);
    });

  return (
    <section className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-6 shadow-sm dark:border-blue-900 dark:bg-blue-950/20">
      <h2 className="mb-1 text-lg font-semibold">Partner Website Simulator</h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Simulates your third-party site: user logs in with email → sees balance → deposit/withdraw/credit/debit
      </p>

      {!loggedIn ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">User Email (partner login)</span>
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@integration.test"
            />
          </label>
          <button
            type="button"
            disabled={!!loading}
            onClick={handleLogin}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Login on Partner Site
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-white p-4 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">Logged in as</p>
            <p className="font-semibold">{loggedIn.name}</p>
            <p className="text-sm text-zinc-500">{loggedIn.email}</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">
              ₹{loggedIn.availableBalance}
              <span className="ml-2 text-sm font-normal text-zinc-500">available</span>
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <input
              className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              type="button"
              disabled={!!loading}
              onClick={refreshBalance}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={handleDeposit}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Deposit (Pay requests)
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={handleWithdrawal}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Withdraw
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={handleCredit}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Credit
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={handleDebit}
              className="rounded-lg bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Debit
            </button>
            <button
              type="button"
              onClick={() => setLoggedIn(null)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-500"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
