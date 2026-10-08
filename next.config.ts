import type { NextConfig } from 'next';

// Served from /v2 until the cut-over, then from the root. basePath is baked
// in at build time, so the image is built with NEXT_PUBLIC_BASE_PATH set.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(self), microphone=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  basePath,
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['postgres', 'bullmq', 'ioredis', '@node-rs/argon2', 'nodemailer'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // nothing frames the app, except its own sandboxed artifact views
      {
        source: '/:path((?!api/v1/artifacts/[^/]+/view|api/v1/public/[^/]+/view).*)',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
      {
        source: '/api/v1/:kind(artifacts|public)/:id/view',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

export default nextConfig;
