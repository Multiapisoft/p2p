import { apiGet, apiPost } from '@/shared/api/client';
import type { SupportTicket, Paginated } from '@/shared/types/api.types';

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

export const supportApi = {
  getMyTickets: (query: SupportListQuery = {}) =>
    apiGet<Paginated<SupportTicket>>('/support/tickets', cleanQuery(query)),
  getById: (ticketId: string) => apiGet<SupportTicket>(`/support/tickets/${ticketId}`),
  create: (subject: string, message: string, priority = 'medium', category?: string) =>
    apiPost<SupportTicket>('/support/tickets', { subject, message, priority, category }),
  reply: (ticketId: string, message: string) =>
    apiPost<SupportTicket>(`/support/tickets/${ticketId}/reply`, { message }),
};
