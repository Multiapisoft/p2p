'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportApi } from '../api/support.api';
import { TicketMessageBody } from '../components/TicketMessageBody';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Modal } from '@/shared/components/ui/Modal';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { formatDate } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast/toast.store';
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

function isDisputeTicket(t: Pick<SupportTicket, 'category' | 'subject' | 'message'>) {
  return (
    t.category === 'withdrawal_dispute' ||
    t.subject.toLowerCase().includes('dispute') ||
    t.message.includes('=== Withdrawal payment dispute ===')
  );
}

function ticketPreview(t: SupportTicket) {
  if (isDisputeTicket(t)) {
    const reason = t.message.match(/^Reason:\s*(.+)$/im)?.[1];
    return reason || 'Withdrawal payment dispute';
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

  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
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
    queryKey: ['support-tickets', listQuery],
    queryFn: () => supportApi.getMy(listQuery),
  });

  const { data: ticketDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['support-ticket', selected?.ticketId],
    queryFn: () => supportApi.getById(selected!.ticketId),
    enabled: !!selected,
  });

  const create = useMutation({
    mutationFn: () => supportApi.create({ subject, message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
      setShowCreate(false);
      setSubject('');
      setMessage('');
      toast.success('Ticket created');
    },
    onError: () => toast.error('Could not create ticket'),
  });

  const sendReply = useMutation({
    mutationFn: () => supportApi.reply(selected!.ticketId, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket', selected?.ticketId] });
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
      setReply('');
      toast.success('Reply sent');
    },
    onError: () => toast.error('Could not send reply'),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const disputeDetail = ticketDetail ? isDisputeTicket(ticketDetail) : false;

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">Support</h1>
          <p className="text-sm text-on-surface-variant">Tickets, replies, and payment disputes</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setShowCreate(true)}>
          New Ticket
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Total
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{total}</p>
          <p className="hidden text-xs text-on-surface-variant sm:block">Matching filters</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Page
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">{items.length}</p>
          <p className="hidden text-xs text-on-surface-variant sm:block">Current page</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 sm:rounded-2xl sm:p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant sm:text-[11px]">
            Disputes
          </p>
          <p className="mt-1 text-lg font-bold sm:text-2xl">
            {items.filter((t) => isDisputeTicket(t)).length}
          </p>
          <p className="hidden text-xs text-on-surface-variant sm:block">On this page</p>
        </div>
      </div>

      <Card title="My tickets">
        <div className="mb-3 space-y-3 sm:mb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              className="w-full min-w-0 flex-1"
              placeholder="Search ticket ID, subject…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              <select
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-2 text-xs sm:px-3 sm:py-2.5 sm:text-sm"
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
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-2 text-xs sm:px-3 sm:py-2.5 sm:text-sm"
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
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-2 text-xs sm:px-3 sm:py-2.5 sm:text-sm"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}/page
                  </option>
                ))}
              </select>
            </div>
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
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition sm:px-3.5 sm:py-1.5 sm:text-xs ${
                  status === s.value
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
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
                : 'No support tickets yet'
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
                    onClick={() => setSelected(t)}
                    className="flex w-full flex-col gap-2 rounded-lg border border-outline-variant p-3 text-left transition-colors hover:bg-surface-container-low sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:rounded-xl sm:p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <p className="text-sm font-semibold sm:text-base">{t.subject}</p>
                        {dispute && (
                          <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-error-container">
                            Dispute
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant sm:text-sm">
                        {ticketPreview(t)}
                      </p>
                      <p className="mt-1 text-[11px] text-on-surface-variant sm:text-xs">
                        #{t.ticketId} · {formatDate(t.createdAt)}
                        {t.priority ? ` · ${t.priority}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Support Ticket">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} required />
          <Button type="submit" loading={create.isPending} className="w-full">
            Submit Ticket
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setReply('');
        }}
        title={selected ? `#${selected.ticketId}` : 'Ticket'}
        className={disputeDetail ? 'sm:max-w-2xl' : 'sm:max-w-xl'}
      >
        {detailLoading ? (
          <LoadingScreen />
        ) : ticketDetail ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold leading-snug">{ticketDetail.subject}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={ticketDetail.status} />
                {disputeDetail && <StatusBadge status="disputed" />}
                <span className="text-xs text-on-surface-variant">
                  {formatDate(ticketDetail.createdAt)}
                </span>
              </div>
            </div>

            <TicketMessageBody message={ticketDetail.message} />

            {!!ticketDetail.replies?.length && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  Conversation
                </p>
                {ticketDetail.replies.map((r, i) => (
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
              />
              <Button
                type="submit"
                className="w-full"
                loading={sendReply.isPending}
                disabled={!reply.trim()}
              >
                Send Reply
              </Button>
            </form>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
