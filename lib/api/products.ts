/**
 * lib/api/products.ts
 *
 * Products API — fetches products that AOA has synced to the merchant's store.
 *
 * Endpoint: GET /store/products
 * Auth: session token (authenticated)
 *
 * Supports pagination, keyword search, and status filtering.
 */

import { apiFetch } from '@/lib/api/client';
import type { StoreProductsResponse, StoreProductsParams } from '@/types/api';

/**
 * Fetch a paginated, searchable list of products AOA has pushed to this store.
 *
 * @param params - Optional page, per_page, search, and status filters
 */
export async function getProducts(
  params?: StoreProductsParams
): Promise<StoreProductsResponse> {
  const query = new URLSearchParams();

  if (params?.page != null)     query.set('page',     String(params.page));
  if (params?.per_page != null) query.set('per_page', String(params.per_page));
  if (params?.search)           query.set('search',   params.search);
  if (params?.status)           query.set('status',   params.status);

  const qs = query.toString();
  return apiFetch<StoreProductsResponse>(`/store/products${qs ? `?${qs}` : ''}`);
}
