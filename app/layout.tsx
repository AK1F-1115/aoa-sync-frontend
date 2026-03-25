/**
 * Root layout — server component.
 *
 * Responsibilities:
 * - Provides the HTML shell (<html>, <body>)
 * - Imports Polaris CSS (must happen once at the root level)
 * - Imports global CSS reset
 * - Wraps children in the global Providers (QueryClient)
 *
 * Does NOT contain App Bridge — that lives in (embedded)/layout.tsx
 * via EmbeddedShell, since not all routes need it (e.g. billing/return).
 */

import type { Metadata } from 'next';
import { Providers } from './providers';
import { config } from '@/lib/config';
import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AOA Sync',
  description: 'Sync your Shopify products to AOA Traders',
  // Prevent search engines from indexing the embedded app
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/*
         * App Bridge v4 setup:
         * 1. meta tag provides the Shopify API key to App Bridge
         * 2. The CDN script initializes the shopify global variable
         * These two tags MUST be in <head> before any page renders.
         * See: https://shopify.dev/docs/api/app-bridge-library
         */}
        <meta name="shopify-api-key" content={config.shopify.apiKey} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
