import type { NextConfig } from 'next';

function backendBaseUrl() {
  const raw = (process.env.BACKEND_URL || 'http://localhost:9091').replace(/\/$/, '');
  if (
    raw.startsWith('http://') &&
    !raw.includes('localhost') &&
    !raw.includes('127.0.0.1')
  ) {
    return `https://${raw.slice('http://'.length)}`;
  }
  return raw;
}

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = backendBaseUrl();
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backend}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
