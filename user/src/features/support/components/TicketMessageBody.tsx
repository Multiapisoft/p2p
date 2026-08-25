'use client';

import type { ReactNode } from 'react';
import { formatDate } from '@/shared/lib/utils';

type Field = { label: string; value: string };

export type ParsedDisputeTicket = {
  raisedBy?: string;
  reason?: string;
  withdrawal: Field[];
  payment: Field[];
  payer?: string;
  note?: string;
  proofUrl?: string;
};

function lineValue(message: string, label: string) {
  const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'im');
  const m = message.match(re);
  return m?.[1]?.trim() || undefined;
}

export function parseWithdrawalDisputeMessage(message: string): ParsedDisputeTicket | null {
  if (!message.includes('=== Withdrawal payment dispute ===')) return null;

  const withdrawalLabels = [
    'Reference',
    'Withdrawal ID',
    'Amount',
    'Paid so far',
    'Reserved (pending)',
    'Method',
    'Status',
    'UPI',
    'Bank',
    'USDT',
  ];
  const paymentLabels = [
    'Payment ref',
    'Payment ID',
    'Amount',
    'UTR',
    'Proof URL',
    'Proof key',
    'Submitted at',
    'Auto-receive at',
    'Payer user ID',
  ];

  // Amount appears in both sections — parse by section slices
  const payStartSplit = message.indexOf('--- Split payment ---');
  const payStartPlain = message.indexOf('--- Payment ---');
  const payStart =
    payStartPlain >= 0
      ? payStartPlain
      : payStartSplit >= 0
        ? payStartSplit
        : -1;
  const wdStart = message.indexOf('--- Withdrawal ---');
  const wdBlock = wdStart >= 0 ? message.slice(wdStart, payStart >= 0 ? payStart : undefined) : message;
  const payBlock = payStart >= 0 ? message.slice(payStart) : message;

  const withdrawal: Field[] = [];
  for (const label of withdrawalLabels) {
    const value = lineValue(wdBlock, label);
    if (value) withdrawal.push({ label, value });
  }

  const payment: Field[] = [];
  for (const label of paymentLabels) {
    const value = lineValue(payBlock, label);
    if (value) payment.push({ label, value });
  }

  // Prefer payment Amount over withdrawal if both somehow merged
  const proofUrl = lineValue(payBlock, 'Proof URL');
  const payer = lineValue(payBlock, 'Payer');

  // Humanize ISO timestamps in fields
  const humanize = (fields: Field[]) =>
    fields.map((f) => {
      if ((f.label === 'Submitted at' || f.label === 'Auto-receive at') && f.value) {
        const d = new Date(f.value);
        if (!Number.isNaN(d.getTime())) return { ...f, value: formatDate(d) };
      }
      return f;
    });

  return {
    raisedBy: lineValue(message, 'Raised by'),
    reason: lineValue(message, 'Reason'),
    withdrawal: humanize(withdrawal),
    payment: humanize(payment),
    payer,
    proofUrl,
    note: message.includes('Auto-receive paused')
      ? 'Auto-receive paused until dispute is resolved by admin.'
      : undefined,
  };
}

function FieldGrid({ fields }: { fields: Field[] }) {
  if (!fields.length) return null;
  return (
    <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={`${f.label}-${f.value}`} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            {f.label}
          </dt>
          <dd className="mt-0.5 break-all text-sm font-medium text-on-surface">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-secondary">{icon}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {children}
    </section>
  );
}

/** Renders withdrawal-dispute dump as structured cards; falls back to plain text. */
export function TicketMessageBody({ message }: { message: string }) {
  const dispute = parseWithdrawalDisputeMessage(message);

  if (!dispute) {
    return (
      <div className="whitespace-pre-wrap rounded-xl bg-surface-container-low px-3.5 py-3 text-sm leading-relaxed text-on-surface">
        {message}
      </div>
    );
  }

  const paymentFields = dispute.payment.filter(
    (f) => f.label !== 'Proof URL' && f.label !== 'Proof key' && f.label !== 'Payer',
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-error/25 bg-error-container/25 px-3.5 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-error">Dispute reason</p>
        <p className="mt-1 text-sm font-medium text-on-surface">
          {dispute.reason || 'No reason provided'}
        </p>
        {dispute.raisedBy && (
          <p className="mt-2 text-xs text-on-surface-variant">Raised by {dispute.raisedBy}</p>
        )}
      </div>

      {dispute.note && (
        <div className="flex gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined shrink-0 text-base text-secondary">info</span>
          <p>{dispute.note}</p>
        </div>
      )}

      <Section title="Withdrawal" icon="account_balance_wallet">
        <FieldGrid fields={dispute.withdrawal} />
      </Section>

      <Section title="Payment" icon="payments">
        <FieldGrid fields={paymentFields} />
        {dispute.payer && (
          <p className="mt-3 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Payer
            </span>
            <span className="mt-0.5 block font-medium">{dispute.payer}</span>
          </p>
        )}
        {dispute.proofUrl && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Payment proof
            </p>
            <a
              href={dispute.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-secondary underline"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              Open proof image
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dispute.proofUrl}
              alt="Payment proof"
              className="mt-1 max-h-48 w-full rounded-lg border border-outline-variant object-contain bg-black/5"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </Section>
    </div>
  );
}
