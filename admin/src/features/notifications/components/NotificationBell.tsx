'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import { formatDate } from '@/shared/lib/utils';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 60000,
  });

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll(),
    enabled: open,
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const count = countData?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-1.5 hover:bg-surface-container-high sm:p-2"
      >
        <span className="material-symbols-outlined text-[22px] sm:text-2xl">notifications</span>
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-error text-[10px] font-bold text-on-error">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-sm font-semibold sm:text-base">Notifications</p>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  className="shrink-0 text-[11px] text-secondary hover:underline sm:text-xs"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="custom-scrollbar max-h-64 overflow-y-auto sm:max-h-80">
              {!data?.items.length ? (
                <p className="px-4 py-5 text-center text-sm text-on-surface-variant">No notifications</p>
              ) : (
                data.items.slice(0, 8).map((n) => (
                  <div
                    key={n._id}
                    className={`border-b border-outline-variant px-3 py-2.5 sm:px-4 sm:py-3 ${!n.isRead ? 'bg-secondary-container/20' : ''}`}
                  >
                    <p className="text-sm font-semibold leading-snug">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{n.message}</p>
                    <p className="mt-1 text-[10px] text-outline sm:text-xs">{formatDate(n.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
