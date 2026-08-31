export const LIVE_POLL_MS = 5_000;

export const liveQueryOptions = {
  staleTime: 0,
  refetchInterval: LIVE_POLL_MS,
  refetchIntervalInBackground: true,
} as const;

export const LIVE_QUERY_ROOTS = [
  'available-withdrawals',
  'business-withdrawals',
  'business-withdrawal',
  'biz-deposit-my-payments',
  'business-my-deposits',
  'business-platform-payments',
  'deposits-summary',
  'deposits',
  'business-overview',
] as const;
