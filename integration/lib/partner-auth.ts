import { NextRequest, NextResponse } from 'next/server';

const LEGACY_KEY = process.env.PARTNER_API_KEY || 'partner_pk_demo';
const LEGACY_SECRET = process.env.PARTNER_API_SECRET || 'partner_sk_demo';

/** Demo: accept legacy creds or any FinGuard-generated pk_/sk_ pair. */
export function verifyPartnerAuth(req: NextRequest): NextResponse | null {
  const apiKey = req.headers.get('x-api-key');
  const apiSecret = req.headers.get('x-api-secret');

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ message: 'Invalid partner API credentials' }, { status: 401 });
  }

  if (apiKey === LEGACY_KEY && apiSecret === LEGACY_SECRET) {
    return null;
  }

  if (apiKey.startsWith('pk_') && apiSecret.startsWith('sk_')) {
    return null;
  }

  return NextResponse.json({ message: 'Invalid partner API credentials' }, { status: 401 });
}
