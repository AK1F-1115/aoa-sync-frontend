'use client';

/**
 * components/EmbeddedShell.tsx
 *
 * Embedded app shell for App Bridge v4.
 *
 * App Bridge v4 does NOT use a React Provider component.
 * Instead, it is initialized via two tags in the HTML <head>:
 *   <meta name="shopify-api-key" content={apiKey} />
 *   <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js">
 *
 * These are already set in app/layout.tsx.
 *
 * This component's job is:
 * 1. Detect whether we are running inside Shopify Admin (window.shopify exists)
 * 2. If NOT embedded — show a clear "open from Shopify Admin" page
 * 3. If embedded — wrap children in Polaris AppProvider + Frame + NavMenu
 */

import { Suspense, useEffect, useState } from 'react';
import { AppProvider as PolarisProvider, Frame, Page, Layout, Banner, Text, BlockStack } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { config } from '@/lib/config';
import { isEmbedded } from '@/lib/shopify/appBridge';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSpinner } from './LoadingSpinner';
import { NavMenu } from './NavMenu';

interface EmbeddedShellProps {
  children: React.ReactNode;
}

/**
 * Shown when the app is accessed directly in a browser rather than
 * through the Shopify Admin iframe.
 */
function NotEmbeddedPage() {
  return (
    <PolarisProvider i18n={enTranslations}>
      <Page>
        <Layout>
          <Layout.Section>
            <Banner title="Open this app from your Shopify Admin" tone="warning">
              <BlockStack gap="200">
                <Text as="p">
                  AOA Sync is an embedded Shopify app. It must be opened from inside
                  your Shopify Admin — it cannot be accessed directly from a browser URL.
                </Text>
                <Text as="p">
                  To open the app:
                </Text>
                <Text as="p">
                  1. Log in to your Shopify Admin at{' '}
                  <strong>your-store.myshopify.com/admin</strong>
                </Text>
                <Text as="p">
                  2. Go to <strong>Apps</strong> in the left sidebar
                </Text>
                <Text as="p">
                  3. Click <strong>AOA Sync</strong>
                </Text>
              </BlockStack>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    </PolarisProvider>
  );
}

function EmbeddedShellInner({ children }: EmbeddedShellProps) {
  // null = still checking (initial SSR/hydration), true/false = result
  const [embeddedState, setEmbeddedState] = useState<boolean | null>(null);

  useEffect(() => {
    // Check after mount so we have access to window
    setEmbeddedState(isEmbedded());

    if (!config.shopify.apiKey) {
      console.error(
        '[AOA Sync] NEXT_PUBLIC_SHOPIFY_API_KEY is not set. ' +
          'App Bridge will not initialize and the embedded app cannot authenticate. ' +
          'Set the variable in .env.local and restart the dev server.'
      );
    }
  }, []);

  // Still hydrating — render nothing to avoid flash
  if (embeddedState === null) return null;

  // Accessed directly in browser — show helpful message
  if (embeddedState === false) return <NotEmbeddedPage />;

  // Running inside Shopify Admin iframe
  return (
    <PolarisProvider i18n={enTranslations}>
      <Frame>
        <NavMenu />
        {children}
      </Frame>
    </PolarisProvider>
  );
}

/**
 * EmbeddedShell — exported component with Suspense + ErrorBoundary wrappers.
 */
export function EmbeddedShell({ children }: EmbeddedShellProps) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <EmbeddedShellInner>{children}</EmbeddedShellInner>
      </Suspense>
    </ErrorBoundary>
  );
}
