/**
 * lib/api/products.ts
 *
 * Catalog API — fetches, pushes, and removes products in the merchant's catalog.
 *
 * Endpoints (all authenticated with session token):
 *   GET    /store/catalog/summary  — aggregate snapshot (counts, top categories/brands)
 *   GET    /store/catalog          — paginated, filterable product list
 *   POST   /store/catalog/push     — push SKUs from AOA pool into Shopify
 *   DELETE /store/catalog/remove   — remove SKUs from Shopify back to pool
 *
 * Multi-tenant safe: backend always filters by store_id from the session token.
 */

import { apiFetch } from '@/lib/api/client';
import type {
  CatalogResponse,
  CatalogParams,
  CatalogSummary,
  PushCatalogRequest,
  PushCatalogResponse,
  RemoveCatalogRequest,
  RemoveCatalogResponse,
} from '@/types/api';

/**
 * Fetch the instant aggregate snapshot for this store's catalog.
 * Fast — no pagination, returns pre-aggregated counts and top-15 lists.
 */
export async function getCatalogSummary(): Promise<CatalogSummary> {
  return apiFetch<CatalogSummary>('/store/catalog/summary');
}

/**
 * Fetch a paginated, filterable list of products.
 *
 * @param params - status, page, page_size, search, supplier, category, brand
 */
export async function getCatalog(
  params?: CatalogParams
): Promise<CatalogResponse> {
  const query = new URLSearchParams();

  if (params?.status)            query.set('status',    params.status);
  if (params?.page      != null) query.set('page',      String(params.page));
  if (params?.page_size != null) query.set('page_size', String(params.page_size));
  if (params?.search)            query.set('search',    params.search);
  if (params?.supplier)          query.set('supplier',  params.supplier);
  if (params?.category)          query.set('category',  params.category);
  if (params?.brand)             query.set('brand',     params.brand);

  const qs = query.toString();
  return apiFetch<CatalogResponse>(`/store/catalog${qs ? `?${qs}` : ''}`);
}

/**
 * Push products from the AOA pool into this store's Shopify catalog.
 *
 * Pass { skus: [...] } to push specific products, or { push_all: true }
 * to fill all remaining plan slots automatically.
 *
 * Rate limited to 5 calls/minute — handle 429 with a cooldown message.
 * On plan limit exceeded, the backend returns 400 with
 * { detail: { error: "plan_limit_exceeded", slots_remaining, ... } }.
 */
export async function pushCatalog(
  request: PushCatalogRequest
): Promise<PushCatalogResponse> {
  return apiFetch<PushCatalogResponse>('/store/catalog/push', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Remove products from this store's Shopify catalog back to the available pool.
 * Removed products can be re-pushed at any time.
 *
 * Rate limited to 5 calls/minute.
 */
export async function removeCatalog(
  request: RemoveCatalogRequest
): Promise<RemoveCatalogResponse> {
  return apiFetch<RemoveCatalogResponse>('/store/catalog/remove', {
    method: 'DELETE',
    body: JSON.stringify(request),
  });
}
