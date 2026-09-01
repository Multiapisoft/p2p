'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { formatCurrency, formatDate } from '@/shared/lib/utils';
import { confirmDialog } from '@/shared/ui/confirm/confirm.store';
import type { TransactionStatus, WithdrawalPaymentBrief } from '@/shared/types/api.types';

function paymentCanAct(p: WithdrawalPaymentBrief) {
  if (p.status !== 'pending' || p.disputedAt) {
    return { received: false, dispute: false, endsAt: undefined as number | undefined };
  }
  const end = p.autoApproveAt
    ? new Date(p.autoApproveAt).getTime()
    : p.createdAt
      ? new Date(p.createdAt).getTime() + 24 * 60 * 60 * 1000
      : 0;
  const within = end > Date.now();
  return {
    received: true,
    dispute: within,
    endsAt: end || undefined,
  };
}

function formatWindowLeft(endsAt?: number) {
  if (!endsAt) return null;
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'Auto-receive due';
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${h}h ${m}m left to dispute`;
}

type Props = {
  payments: WithdrawalPaymentBrief[];
  currency: string;
  onConfirm: (paymentId: string) => void;
  onDispute: (paymentId: string, reason?: string) => void;
  confirmingId?: string | null;
  disputing?: boolean;
  actionError?: string;
  onClearError?: () => void;
};

export function WithdrawalOwnerPaymentsPanel({
  payments,
  currency,
  onConfirm,
  onDispute,
  confirmingId,
  disputing,
  actionError,
  onClearError,
}: Props) {
  const [disputeFor, setDisputeFor] = useState<WithdrawalPaymentBrief | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  if (!payments.length) return null;

  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          {payments.length <= 1 ? 'Payment' : 'Payments'}
        </p>
        <p className="text-[11px] text-on-surface-variant sm:text-xs">
          Tap Received if you got the money, or Dispute within 24 hours. After that it
          auto-confirms.
        </p>
        {actionError && (
          <p className="rounded-lg border border-error/30 bg-error-container/30 px-2.5 py-2 text-xs text-error">
            {actionError}
          </p>
        )}
        {payments.map((p) => {
          const acts = paymentCanAct(p);
          const windowLabel = formatWindowLeft(acts.endsAt);
          const payCurrency = p.currency || currency;
          return (
            <div
              key={p._id}
              className="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:px-3 sm:py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold sm:text-base">
                  {formatCurrency(p.amount, payCurrency)}
                </p>
                <p className="mt-0.5 break-all text-[11px] text-on-surface-variant">
                  {p.referenceId}
                  {p.utr ? ` · UTR ${p.utr}` : ''}
                  {p.createdAt ? ` · ${formatDate(p.createdAt)}` : ''}
                </p>
                {p.status === 'pending' && windowLabel && !p.disputedAt && (
                  <p className="mt-1 text-[11px] text-secondary">{windowLabel}</p>
                )}
                {p.disputedAt && (
                  <p className="mt-1 text-[11px] text-error">
                    Support ticket{' '}
                    <span className="font-mono">{p.disputeTicketId || '—'}</span>
                    {p.notes?.includes('. ')
                      ? ` · ${p.notes.split('. ').slice(1).join('. ').trim()}`
                      : ''}
                  </p>
                )}
                {p.status === 'rejected' && p.rejectionReason && (
                  <p className="mt-1 text-[11px] text-error">{p.rejectionReason}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {p.proofImageUrl && (
                  <a
                    href={p.proofImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-secondary underline"
                  >
                    Proof
                  </a>
                )}
                <StatusBadge status={(p.disputedAt ? 'disputed' : p.status) as TransactionStatus} />
                {acts.received && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={confirmingId === p._id}
                    onClick={async () => {
                      onClearError?.();
                      const ok = await confirmDialog({
                        title: 'Confirm payment received?',
                        description: `Confirm you received ${formatCurrency(p.amount, payCurrency)}.`,
                        confirmLabel: 'Yes, I received it',
                        cancelLabel: 'Not yet',
                        variant: 'secondary',
                      });
                      if (ok) onConfirm(p._id);
                    }}
                  >
                    Received
                  </Button>
                )}
                {acts.dispute && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onClearError?.();
                      setDisputeFor(p);
                      setDisputeReason('');
                    }}
                  >
                    Dispute
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {disputeFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-outline-variant bg-surface-container-lowest p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:max-w-md sm:rounded-2xl sm:p-5 sm:pb-5">
            <h3 className="text-base font-semibold sm:text-lg">Raise a dispute</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              Opens a support ticket. Auto-receive pauses until resolved.
            </p>
            <p className="mt-3 break-all text-xs text-on-surface-variant">
              {disputeFor.referenceId} · {formatCurrency(disputeFor.amount, disputeFor.currency || currency)}
              {disputeFor.utr ? ` · UTR ${disputeFor.utr}` : ''}
            </p>
            <label className="mt-4 block text-sm font-medium">
              Reason
              <textarea
                className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm"
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Payment not received, wrong amount, fake proof…"
              />
            </label>
            {actionError && <p className="mt-2 text-xs text-error">{actionError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDisputeFor(null);
                  setDisputeReason('');
                  onClearError?.();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={disputing}
                onClick={() => {
                  onDispute(disputeFor._id, disputeReason.trim() || undefined);
                  setDisputeFor(null);
                  setDisputeReason('');
                }}
              >
                Submit dispute
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
