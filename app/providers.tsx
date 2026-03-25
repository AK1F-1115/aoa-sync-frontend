'use client';

/**
 * Global providers — client component.
 *
 * Responsibilities:
 * - Provides React Query's QueryClient to the entire app
 * - Configures sensible defaults for queries (staleTime, retry policy)
 * - Shows React Query DevTools in development mode only
 *
 * Does NOT contain App Bridge or Polaris AppProvider —
 * those are scoped to the embedded route group.
 */

import { useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * 30 seconds before data is considered stale.
         * Prevents unnecessary refetches on quick navigation.
         */
        staleTime: 30_000,
        /**
         * Retry policy:
         * - Do not retry on 4xx client errors (bad request, not found, forbidden)
         * - Retry up to 2 times on 5xx server errors or network failures
         */
        retry: (failureCount, error) => {
          if (
            error instanceof Error &&
            'status' in error &&
            typeof (error as { status: unknown }).status === 'number' &&
            (error as { status: number }).status < 500
          ) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        /**
         * Do not retry mutations automatically.
         * Mutations have side effects — the UI must handle retries explicitly.
         */
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  /**
   * Use useState to ensure the QueryClient is created only once per
   * component lifecycle, not recreated on every render.
   */
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
