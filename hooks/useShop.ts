/**
 * hooks/useShop.ts
 *
 * Convenience hook — returns just the current shop info from merchant context.
 * Use this when you only need shop data and don't need sync health.
 *
 * Usage:
 *   const { shop, isLoading } = useShop();
 */

'use client';

import { useMerchantContext } from './useMerchantContext';
import type { ShopInfo } from '@/types/merchant';

interface UseShopResult {
  shop: ShopInfo | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useShop(): UseShopResult {
  const { shop, isLoading, isError } = useMerchantContext();
  return { shop, isLoading, isError };
}
