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
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9091';
}
