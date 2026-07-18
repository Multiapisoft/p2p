import { NextRequest, NextResponse } from 'next/server';
import { addWebhookEvent, clearWebhookEvents, getWebhookEvents } from '@/lib/webhook-store';

export async function GET() {
  return NextResponse.json({ events: getWebhookEvents() });
}

export async function DELETE() {
  clearWebhookEvents();
  return NextResponse.json({ cleared: true });
}

export async function POST(req: NextRequest) {
  const event = req.headers.get('x-webhook-event') || 'unknown';
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    payload = { raw: await req.text() };
  }

  const entry = addWebhookEvent(event, payload);
  return NextResponse.json({ received: true, id: entry.id });
}
