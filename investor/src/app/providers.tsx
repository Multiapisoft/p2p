'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useP2pListLive } from '@/shared/hooks/useP2pListLive';

const P2P_LIST_KEYS = ['fulfill-available', 'invest-withdrawals'];

function P2pListLiveSync() {
  useP2pListLive(P2P_LIST_KEYS);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <P2pListLiveSync />
      {children}
    </QueryClientProvider>
  );
}
