/**
 * hooks/useMerchantContext.ts
 *
 * React Query hook that provides the merchant's dashboard data.
 *
 * Returns shop info, sync health, and subscription in one call.
 * Designed to be extensible for WorkOS user context later.
 *
 * Usage:
 *   const { shop, syncHealth, subscription, isLoading, error } = useMerchantContext();
 *
 * App Bridge v4: No app instance needed — session tokens come from shopify global.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { getDashboardData } from '@/lib/api/dashboard';
import { ApiError } from '@/lib/api/client';
import type { DashboardData } from '@/types/merchant';

interface UseMerchantContextResult {
  shop: DashboardData['shop'] | undefined;
  syncHealth: DashboardData['syncHealth'] | undefined;
  subscription: DashboardData['subscription'] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches and caches the full merchant context (shop + sync + subscription).
 * The query is keyed by 'merchantContext' for React Query cache management.
 *
 * Retry policy:
 * - Retries once on 401 after a 1s delay.
 *   Reason: App Bridge v4 initializes window.shopify synchronously but the
 *   session token negotiation with Shopify Admin is async. The very first
 *   shopify.idToken() call can return before the session is ready, causing
 *   a spurious 401. One retry with a delay resolves this reliably.
 * - Does not retry on other 4xx errors (real auth/client failures).
 */
export function useMerchantContext(): UseMerchantContextResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['merchantContext'],
    queryFn: getDashboardData,
    staleTime: 30_000,
    retry: (failureCount, err) => {
      // Retry once on 401 only — handles App Bridge session timing race
      if (err instanceof ApiError && err.status === 401 && failureCount < 1) {
        return true;
      }
      return false;
    },
    retryDelay: 1000, // 1s — enough time for App Bridge to finish session negotiation
  });

  return {
    shop: data?.shop,
    syncHealth: data?.syncHealth,
    subscription: data?.subscription,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
