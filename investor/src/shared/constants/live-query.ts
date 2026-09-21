/** Fallback only when the socket is down. Lists refresh via WebSocket `list-changed`. */
export const LIVE_POLL_MS = 90_000;

export const liveQueryOptions = {
  staleTime: 30_000,
  refetchInterval: LIVE_POLL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
} as const;

export const LIVE_QUERY_ROOTS = [
  'available-withdrawals',
  'invest-withdrawals',
  'fulfill-available',
  'my-withdrawals',
  'portfolio',
  'wallet-balance',
  'deposits',
] as const;
