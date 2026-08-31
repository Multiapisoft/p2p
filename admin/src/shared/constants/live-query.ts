/** Fallback poll when socket misses an event; keeps lists feeling live. */
export const LIVE_POLL_MS = 5_000;

export const liveQueryOptions = {
  staleTime: 0,
  refetchInterval: LIVE_POLL_MS,
  refetchIntervalInBackground: true,
} as const;

/** React-query roots invalidated on P2P / withdrawal / deposit changes. */
export const LIVE_QUERY_ROOTS = [
  'available-withdrawals',
  'withdrawals',
  'withdrawal-admin',
  'withdrawal-payments',
  'deposits',
  'deposit',
  'admin-deposit-my-payments',
  'admin-my-deposits',
  'admin-my-withdrawals',
  'my-p2p-payments',
] as const;
