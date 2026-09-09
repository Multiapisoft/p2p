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
    // Absolute API/WS on Vercel avoids same-origin bot challenge blocking /api rewrites.
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.VERCEL ? 'https://dev.payment.fairplayoffical.com/api/v1' : '/api/v1'),
    NEXT_PUBLIC_WS_URL:
      process.env.NEXT_PUBLIC_WS_URL ||
      (process.env.VERCEL ? 'https://dev.payment.fairplayoffical.com' : ''),
    NEXT_PUBLIC_USER_APP_URL:
      process.env.NEXT_PUBLIC_USER_APP_URL ||
      (process.env.VERCEL
        ? 'https://dev.app.fairplayoffical.com'
        : 'http://localhost:4761'),
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
