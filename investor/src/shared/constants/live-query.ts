export const LIVE_POLL_MS = 5_000;

export const liveQueryOptions = {
  staleTime: 0,
  refetchInterval: LIVE_POLL_MS,
  refetchIntervalInBackground: true,
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
