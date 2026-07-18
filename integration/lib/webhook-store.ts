import type { WebhookEvent } from './types';

const MAX_EVENTS = 50;
const events: WebhookEvent[] = [];

export function addWebhookEvent(event: string, payload: unknown) {
  const entry: WebhookEvent = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    receivedAt: new Date().toISOString(),
    event,
    payload,
  };
  events.unshift(entry);
  if (events.length > MAX_EVENTS) events.pop();
  return entry;
}

export function getWebhookEvents() {
  return [...events];
}

export function clearWebhookEvents() {
  events.length = 0;
}
