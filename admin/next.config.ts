import type { NextConfig } from 'next';

function backendBaseUrl() {
  const raw = (
    process.env.BACKEND_URL ||
    (process.env.VERCEL ? 'https://dev.payment.fairplayoffical.com' : 'http://localhost:9091')
  ).replace(/\/$/, '');
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
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  },
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    const backend = backendBaseUrl();
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
