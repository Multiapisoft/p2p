import { apiGet, apiPost } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { Paginated, SupportTicket, TicketAttachment } from '@/shared/types/api.types';

export type SupportListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: string;
  category?: string;
  priority?: string;
};

function cleanQuery(query: SupportListQuery = {}) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() || undefined,
    status: query.status && query.status !== 'all' ? query.status : undefined,
    sort: query.sort || 'newest',
    category: query.category && query.category !== 'all' ? query.category : undefined,
    priority: query.priority && query.priority !== 'all' ? query.priority : undefined,
  };
}

async function uploadAttachment(file: File): Promise<TicketAttachment> {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'support-ticket');

  const token = useAuthStore.getState().token;
  const base = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const res = await fetch(`${base}/uploads/proof`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const json = (await res.json().catch(() => null)) as {
    data?: TicketAttachment;
    message?: string | string[];
  } | null;

  if (!res.ok) {
    const msg = json?.message;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg || 'Upload failed');
  }
  if (!json?.data?.key) throw new Error('Upload failed');
  return {
    ...json.data,
    filename: json.data.filename || file.name,
    contentType: json.data.contentType || file.type,
    size: json.data.size || file.size,
  };
}

export const supportApi = {
  getMy: (query: SupportListQuery = {}) =>
    apiGet<Paginated<SupportTicket>>('/support/tickets', cleanQuery(query)),
  getById: (ticketId: string) => apiGet<SupportTicket>(`/support/tickets/${ticketId}`),
  create: (payload: {
    subject: string;
    message: string;
    priority?: string;
    category?: string;
    attachments?: TicketAttachment[];
  }) =>
    apiPost<SupportTicket>('/support/tickets', {
      ...payload,
      attachments: payload.attachments?.length ? payload.attachments : undefined,
    }),
  reply: (ticketId: string, message: string, attachments?: TicketAttachment[]) =>
    apiPost<SupportTicket>(`/support/tickets/${ticketId}/reply`, {
      message,
      attachments: attachments?.length ? attachments : undefined,
    }),
  uploadAttachment,
};
