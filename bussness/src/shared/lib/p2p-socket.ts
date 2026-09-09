/** Backend origin for Socket.IO (namespace `/p2p` is appended by the client). */
export function p2pSocketOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || '';
  if (/^https?:\/\//i.test(fromEnv)) {
    return fromEnv.replace(/\/api\/v1\/?$/i, '').replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:9091';
  }
  // Never use the panel origin for sockets — Next rewrites only /api, not socket.io.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('paysecure247.com') || host.includes('fairplayoffical.com') || host.includes('invespro.xyz')) {
      return 'https://dev.payment.fairplayoffical.com';
    }
  }
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9091';
}
