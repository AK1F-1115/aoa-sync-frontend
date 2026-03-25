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
 * 1. Wrap children in Polaris AppProvider + Frame
 * 2. Render NavMenu (App Bridge sidebar navigation)
 * 3. Provide an ErrorBoundary for the embedded section
 *
 * Must be used inside a <Suspense> boundary if any child calls useSearchParams().
 * EmbeddedShell wraps itself in Suspense via the exported component below.
 */

import { Suspense, useEffect } from 'react';
import { AppProvider as PolarisProvider } from '@shopify/polaris';
import { Frame } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { config } from '@/lib/config';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSpinner } from './LoadingSpinner';
import { NavMenu } from './NavMenu';

interface EmbeddedShellProps {
  children: React.ReactNode;
}

function EmbeddedShellInner({ children }: EmbeddedShellProps) {
  // Runtime guard: warn loudly in the browser when the API key is missing.
  // During `next build` the key is allowed to be empty (build-time placeholder).
  // In a live embedded session it MUST be set or App Bridge cannot authenticate.
  useEffect(() => {
    if (!config.shopify.apiKey) {
      console.error(
        '[AOA Sync] NEXT_PUBLIC_SHOPIFY_API_KEY is not set. ' +
          'App Bridge will not initialize and the embedded app cannot authenticate. ' +
          'Set the variable in .env.local and restart the dev server.'
      );
    }
  }, []);

  return (
    <PolarisProvider i18n={enTranslations}>
      {/*
       * Frame provides the context for Polaris Toast, ContextualSaveBar,
       * and Loading bar components. Shopify Admin provides the outer chrome.
       */}
      <Frame>
        {/* Register sidebar navigation links in Shopify Admin */}
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
