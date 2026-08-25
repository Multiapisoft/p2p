'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { p2pSocketOrigin } from '@/shared/lib/p2p-socket';

const LIST_CHANGED = 'list-changed';

/** Live-invalidate P2P pay lists when any user claims / lists / pays. */
export function useP2pListLive(queryKeys: string[]) {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(`${p2pSocketOrigin()}/p2p`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });

    const refresh = () => {
      for (const key of queryKeys) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    };

    socket.on(LIST_CHANGED, refresh);

    return () => {
      socket.off(LIST_CHANGED, refresh);
      socket.disconnect();
    };
  }, [token, qc, queryKeys]);
}
