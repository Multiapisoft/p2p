import type { NextConfig } from 'next';

function backendBaseUrl() {
  const raw = (process.env.BACKEND_URL || 'http://localhost:9091').replace(/\/$/, '');
  // Avoid http→https 301 from CDN/nginx which surfaces as browser CORS after rewrite.
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
