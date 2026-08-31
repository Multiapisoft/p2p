'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { LIVE_QUERY_ROOTS } from '@/shared/constants/live-query';
import { p2pSocketOrigin } from '@/shared/lib/p2p-socket';

const LIST_CHANGED = 'list-changed';

/** Instant refresh for deposit / withdrawal lists via WebSocket + query invalidation. */
export function useP2pListLive(queryKeys: readonly string[] = LIVE_QUERY_ROOTS) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const keysSig = queryKeys.join('\0');

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(`${p2pSocketOrigin()}/p2p`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });

    const refresh = () => {
      for (const key of queryKeys) {
        void qc.invalidateQueries({
          queryKey: [key],
          refetchType: 'active',
        });
      }
    };

    socket.on(LIST_CHANGED, refresh);
    socket.on('connect', refresh);

    return () => {
      socket.off(LIST_CHANGED, refresh);
      socket.off('connect', refresh);
      socket.disconnect();
    };
  }, [token, qc, keysSig, queryKeys]);
}
