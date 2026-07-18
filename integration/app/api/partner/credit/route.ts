import { NextRequest, NextResponse } from 'next/server';
import { verifyPartnerAuth } from '@/lib/partner-auth';
import { balanceForIdentity } from '@/lib/partner-balance';

function readIdentity(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase() || null;
  const userId = req.nextUrl.searchParams.get('userId')?.trim() || null;
  if (!email && !userId) {
    return { error: NextResponse.json({ message: 'email or userId query required' }, { status: 400 }) };
  }
  return { email, userId, balance: balanceForIdentity(email || userId || '', userId) };
}

export async function GET(req: NextRequest) {
  const denied = verifyPartnerAuth(req);
  if (denied) return denied;

  const identity = readIdentity(req);
  if ('error' in identity) return identity.error;

  return NextResponse.json({
    data: { email: identity.email, userId: identity.userId, balance: identity.balance },
  });
}

export async function POST(req: NextRequest) {
  const denied = verifyPartnerAuth(req);
  if (denied) return denied;

  const identity = readIdentity(req);
  if ('error' in identity) return identity.error;

  const body = await req.json().catch(() => ({}));
  const amount = Number((body as { amount?: number }).amount || 0);

  return NextResponse.json({
    data: {
      email: identity.email,
      userId: identity.userId,
      amount,
      success: true,
      balance: identity.balance,
    },
  });
}
