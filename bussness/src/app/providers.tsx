'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useP2pListLive } from '@/shared/hooks/useP2pListLive';
import { LIVE_QUERY_ROOTS } from '@/shared/constants/live-query';

import { ConfirmDialogHost } from '@/shared/ui/confirm/ConfirmDialogHost';

function P2pListLiveSync() {
  useP2pListLive(LIVE_QUERY_ROOTS);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <P2pListLiveSync />
      <ConfirmDialogHost />
      {children}
    </QueryClientProvider>
  );
}
