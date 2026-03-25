'use client';

/**
 * components/LoadingSpinner.tsx
 *
 * Full-page loading fallback used as the Suspense boundary fallback
 * and during App Bridge initialization.
 *
 * Uses Polaris Spinner centered on screen.
 */

import { Spinner } from '@shopify/polaris';

export function LoadingSpinner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <Spinner accessibilityLabel="Loading AOA Sync" size="large" />
    </div>
  );
}
