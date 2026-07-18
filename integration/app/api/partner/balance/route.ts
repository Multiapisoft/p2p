import { NextRequest, NextResponse } from 'next/server';
import { verifyPartnerAuth } from '@/lib/partner-auth';
import { balanceForIdentity } from '@/lib/partner-balance';

/** Demo third-party balance API — FinGuard calls this to fetch user balance. */
export async function GET(req: NextRequest) {
  const denied = verifyPartnerAuth(req);
  if (denied) return denied;

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  const userId = req.nextUrl.searchParams.get('userId')?.trim();
  if (!email && !userId) {
    return NextResponse.json({ message: 'email or userId query required' }, { status: 400 });
  }

  const bal = balanceForIdentity(email || userId || '', userId);

  return NextResponse.json({
    data: {
      email: email || null,
      userId: userId || null,
      balance: bal,
    },
  });
}
