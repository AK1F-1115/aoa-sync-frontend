'use client';

import { useEffect } from 'react';
import { AppProvider, Page, Banner, Button, BlockStack } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary for the embedded app.
 *
 * This catches unhandled exceptions that bubble up from any page inside the
 * (embedded) route group. It shows a clean Polaris error banner instead of the
 * raw Next.js "Application error" crash screen, which is especially important
 * when App Bridge session token initialization fails (e.g. timing race on fresh
 * page loads, or the app is visited outside Shopify Admin).
 */
export default function EmbeddedError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[AOA Sync] Unhandled error in embedded route:', error);
  }, [error]);

  // Try to detect an App Bridge / session token error specifically
  const isAppBridgeError =
    error.message?.includes('appBridge') ||
    error.message?.includes('shopify global') ||
    error.message?.includes('idToken') ||
    error.message?.includes('session');

  const title = isAppBridgeError
    ? 'Session initialization failed'
    : 'Something went wrong';

  const description = isAppBridgeError
    ? 'The app could not establish a session with Shopify. This usually resolves on a page reload.'
    : error.message || 'An unexpected error occurred.';

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="AOA Sync">
        <BlockStack gap="400">
          <Banner
            title={title}
            tone="critical"
            action={{ content: 'Reload page', onAction: () => window.location.reload() }}
            secondaryAction={{ content: 'Try again', onAction: reset }}
          >
            <p>{description}</p>
            {error.digest && (
              <p style={{ marginTop: '4px', fontSize: '12px', color: '#6d7175' }}>
                Error ID: {error.digest}
              </p>
            )}
          </Banner>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
