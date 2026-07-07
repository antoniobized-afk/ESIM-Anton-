const path = require('path');
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: { cacheName: 'google-fonts', expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 } },
    },
    {
      urlPattern: /^https:\/\/api\.qrserver\.com\/.*/i,
      handler: 'CacheFirst',
      options: { cacheName: 'qr-codes', expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 } },
    },
    {
      urlPattern: /\/api\/products.*/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'api-products', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 } },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/flags/:code.png',
        destination: 'https://flagcdn.com/64x48/:code.png',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
