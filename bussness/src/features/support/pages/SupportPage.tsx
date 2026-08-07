'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportApi } from '../api/support.api';
import { TicketMessageBody } from '../components/TicketMessageBody';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { LoadingScreen, EmptyState } from '@/shared/components/ui/Icon';
import { PageHeader } from '@/shared/components/layout/PageHeader';
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
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
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
    queryKey: ['support', listQuery],
    queryFn: () => supportApi.getMyTickets(listQuery),
  });

  const { data: ticket, isLoading: loadingTicket } = useQuery({
    queryKey: ['support-ticket', selectedTicketId],
    queryFn: () => supportApi.getById(selectedTicketId!),
    enabled: !!selectedTicketId,
  });

  const createTicket = useMutation({
    mutationFn: () => supportApi.create({ subject, message, priority: 'medium' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support'] });
      setShowCreate(false);
      setSubject('');
      setMessage('');
    },
  });

  const sendReply = useMutation({
    mutationFn: () => supportApi.reply(selectedTicketId!, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket'] });
      qc.invalidateQueries({ queryKey: ['support'] });
      setReply('');
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const isDispute = ticket ? isDisputeTicket(ticket) : false;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Support"
        description="Your tickets and disputes on your users' withdrawals"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined text-lg">add</span>
            New Ticket
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Total results
          </p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            On this page
          </p>
          <p className="mt-1 text-2xl font-bold">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            Disputes here
          </p>
          <p className="mt-1 text-2xl font-bold">
            {items.filter((t) => isDisputeTicket(t)).length}
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[220px] flex-1"
              placeholder="Search ticket ID, subject, message…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
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
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
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
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm"
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
                className={`chip ${status === s.value ? 'chip-active' : ''}`}
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
                : 'No tickets yet'
            }
            icon="support_agent"
          />
        ) : (
          <>
            <div className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
              {items.map((t) => {
                const dispute = isDisputeTicket(t);
                return (
                  <button
                    key={t._id}
                    type="button"
                    onClick={() => setSelectedTicketId(t.ticketId)}
                    className="w-full rounded-xl border border-outline-variant p-4 text-left hover:bg-surface-container-low"
                  >
                    <div className="flex items-start justify-between gap-4">
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
                      <StatusBadge status={t.status} />
                    </div>
                  </button>
                );
              })}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Support Ticket">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createTicket.mutate();
          }}
        >
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} required />
          <Button type="submit" className="w-full" loading={createTicket.isPending}>
            Submit Ticket
          </Button>
        </form>
      </Modal>

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
                {isDispute && (
                  <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-error-container">
                    Dispute
                  </span>
                )}
                <span className="text-xs text-on-surface-variant">
                  {formatDate(ticket.createdAt)}
                </span>
              </div>
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

            {ticket.status !== 'closed' && (
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
                  required
                />
                <Button type="submit" className="w-full" loading={sendReply.isPending}>
                  Send Reply
                </Button>
              </form>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
