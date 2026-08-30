'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { withdrawalsApi } from '@/features/withdrawals/api/withdrawals.api';
import { Modal } from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { formatCurrency } from '@/shared/lib/utils';

const SEEN_KEY = 'admin-wd-popup-seen-ids';

function readSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
}

function notifyNewWithdrawal(amount: number, referenceId: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  const title = 'New withdrawal available';
  const body = `${referenceId} · ${formatCurrency(amount)} is listed for P2P pay.`;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: 'admin-new-wd' });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Polls pending listed withdrawals on the Deposits page and pops a modal
 * when a newly listed WD appears (mirrors business deposit match popup).
 */
export function AdminNewWithdrawalPopup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState<{
    referenceId: string;
    amount: number;
    currency?: string;
  } | null>(null);
  const primedRef = useRef(false);
  const seenRef = useRef<Set<string>>(readSeen());

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const { data } = useQuery({
    queryKey: ['admin-new-wd-watch'],
    queryFn: () =>
      withdrawalsApi.getAll({
        page: 1,
        limit: 20,
        status: 'pending',
        sort: 'newest',
      }),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!data?.items) return;
    const listed = data.items.filter((w) => w.p2pListStatus === 'listed');
    if (!primedRef.current) {
      for (const w of listed) seenRef.current.add(w._id);
      writeSeen(seenRef.current);
      primedRef.current = true;
      return;
    }
    const fresh = listed.find((w) => !seenRef.current.has(w._id));
    if (!fresh) return;
    for (const w of listed) seenRef.current.add(w._id);
    writeSeen(seenRef.current);
    setLatest({
      referenceId: fresh.referenceId,
      amount: fresh.amount,
      currency: fresh.currency,
    });
    setOpen(true);
    notifyNewWithdrawal(fresh.amount, fresh.referenceId);
  }, [data]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="New withdrawal listed">
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          {latest ? (
            <>
              <span className="font-semibold text-on-surface">{latest.referenceId}</span> (
              {formatCurrency(latest.amount, latest.currency)})
            </>
          ) : (
            'New withdrawal available.'
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              setOpen(false);
              router.push('/my-deposits');
            }}
          >
            Open My Deposits
          </Button>
          <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(false)}>
            Dismiss
          </Button>
        </div>
      </div>
    </Modal>
  );
}
