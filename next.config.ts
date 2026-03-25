import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * CSP frame-ancestors:
   * Allows Shopify Admin to embed this app in an iframe.
   * This is REQUIRED for embedded Shopify apps.
   *
   * Note: frame-ancestors in CSP takes precedence over X-Frame-Options.
   * We do NOT set X-Frame-Options to avoid conflicting with the CSP directive.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              // Allow Shopify to embed this app
              "frame-ancestors 'self' https://*.myshopify.com https://admin.shopify.com",
            ].join('; '),
          },
        ],
      },
    ];
  },

  /**
   * Images: allow Shopify CDN for shop logos if needed
   */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.shopify.com',
      },
      {
        protocol: 'https',
        hostname: '*.myshopify.com',
      },
    ],
  },

  /**
   * Redirect any direct hits to "/" → "/dashboard"
   * This is a belt-and-suspenders redirect in addition to app/page.tsx
   */
  async redirects() {
    return [];
  },
};

export default nextConfig;
