'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportApi } from '../api/support.api';
import { TicketMessageBody } from '../components/TicketMessageBody';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Textarea } from '@/shared/components/ui/Textarea';
import { Input } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatDate } from '@/shared/lib/utils';
import type { SupportTicket } from '@/shared/types/api.types';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORY_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'withdrawal_dispute', label: 'Disputes' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'subject', label: 'Subject A–Z' },
];

const PAGE_SIZES = [5, 10, 20];
const ADMIN_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

function isDisputeTicket(t: Pick<SupportTicket, 'category' | 'subject' | 'message'>) {
  return (
    t.category === 'withdrawal_dispute' ||
    t.subject.toLowerCase().includes('dispute') ||
    t.message.includes('=== Withdrawal payment dispute ===')
  );
}

function ticketPreview(t: SupportTicket) {
  if (isDisputeTicket(t)) {
    return t.message.match(/^Reason:\s*(.+)$/im)?.[1] || 'Withdrawal payment dispute';
  }
  return t.message;
}

export function SupportPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listQuery = useMemo(
    () => ({ page, limit, status, category, sort, search }),
    [page, limit, status, category, sort, search],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['support', listQuery],
    queryFn: () => supportApi.getAll(listQuery),
  });

  const { data: ticket, isLoading: loadingTicket } = useQuery({
    queryKey: ['support-ticket', selectedTicketId],
    queryFn: () => supportApi.getById(selectedTicketId!),
    enabled: !!selectedTicketId,
  });

  const sendReply = useMutation({
    mutationFn: () => supportApi.reply(selectedTicketId!, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket'] });
      qc.invalidateQueries({ queryKey: ['support'] });
      setReply('');
    },
  });

  const updateStatus = useMutation({
    mutationFn: (next: string) => supportApi.updateStatus(selectedTicketId!, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket'] });
      qc.invalidateQueries({ queryKey: ['support'] });
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const isDispute = ticket ? isDisputeTicket(ticket) : false;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Support</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">All user tickets and withdrawal disputes</p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total results
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{total}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            On this page
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{items.length}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Disputes here
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">
            {items.filter((t) => isDisputeTicket(t)).length}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="min-w-0 flex-1 sm:min-w-[220px]"
              placeholder="Search ticket ID, subject, message…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm sm:px-3 sm:py-2.5"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm sm:px-3 sm:py-2.5"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              {CATEGORY_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm sm:px-3 sm:py-2.5"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>

          <div className="chip-scroll">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  setStatus(s.value);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  status === s.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen />
        ) : !items.length ? (
          <EmptyState
            message={
              search || status !== 'all' || category !== 'all'
                ? 'No tickets match your filters'
                : 'No tickets'
            }
            icon="support_agent"
          />
        ) : (
          <>
            <div className={`space-y-2 sm:space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((t) => {
                const dispute = isDisputeTicket(t);
                return (
                  <button
                    key={t._id}
                    type="button"
                    onClick={() => setSelectedTicketId(t.ticketId)}
                    className="w-full rounded-lg border border-outline-variant p-3 text-left hover:bg-surface-container-low sm:rounded-xl sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{t.subject}</p>
                          {dispute && (
                            <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-error-container">
                              Dispute
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">
                          {ticketPreview(t)}
                        </p>
                        <p className="mt-2 text-xs text-outline">
                          {t.ticketId} • {formatDate(t.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:gap-2">
                        <StatusBadge status={t.status} />
                        <StatusBadge status={t.priority} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-5">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </Card>

      <Modal
        open={!!selectedTicketId}
        onClose={() => {
          setSelectedTicketId(null);
          setReply('');
        }}
        title={ticket ? `#${ticket.ticketId}` : 'Ticket'}
        className="sm:max-w-2xl"
      >
        {loadingTicket ? (
          <LoadingScreen />
        ) : ticket ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold leading-snug">{ticket.subject}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status} />
                <StatusBadge status={ticket.priority} />
                {isDispute && <StatusBadge status="disputed" />}
                <span className="text-xs text-on-surface-variant">
                  {formatDate(ticket.createdAt)}
                </span>
              </div>
            </div>

            <div className="chip-scroll">
              {ADMIN_STATUSES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={ticket.status === s ? 'secondary' : 'outline'}
                  onClick={() => updateStatus.mutate(s)}
                >
                  {s.replace('_', ' ')}
                </Button>
              ))}
            </div>

            <TicketMessageBody message={ticket.message} />

            {!!ticket.replies?.length && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  Conversation
                </p>
                {ticket.replies.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 py-3 text-sm"
                  >
                    <p className="leading-relaxed">{r.message}</p>
                    <p className="mt-1.5 text-xs text-outline">{formatDate(r.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}

            <form
              className="space-y-3 border-t border-outline-variant pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) sendReply.mutate();
              }}
            >
              <Textarea
                label="Reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your message..."
                required
              />
              <Button type="submit" className="w-full" loading={sendReply.isPending}>
                Send Reply
              </Button>
            </form>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
