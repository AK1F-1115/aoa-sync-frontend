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
 */
export function useMerchantContext(): UseMerchantContextResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['merchantContext'],
    queryFn: getDashboardData,
    staleTime: 30_000,
    retry: 1,
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
