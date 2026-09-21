/** Fallback only when the socket is down. Lists refresh via WebSocket `list-changed`. */
export const LIVE_POLL_MS = 90_000;

export const liveQueryOptions = {
  staleTime: 30_000,
  refetchInterval: LIVE_POLL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
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
