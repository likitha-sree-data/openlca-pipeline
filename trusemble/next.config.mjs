/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: process.env.STANDALONE === '1' ? 'standalone' : undefined,
  serverExternalPackages: ['exceljs'],
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
  webpack(config, { isServer }) {
    // node:sqlite is a recent builtin that webpack does not know about yet.
    if (isServer) {
      const prev = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(prev) ? prev : [prev]),
        ({ request }, cb) => (request === 'node:sqlite' ? cb(null, 'commonjs node:sqlite') : cb()),
      ];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      { source: '/ops/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};
export default nextConfig;
