/**
 * lib/api/products.ts
 *
 * Catalog API — fetches, pushes, and removes products in the merchant's catalog.
 *
 * Endpoints (all authenticated with session token):
 *   GET    /store/catalog/summary  — aggregate snapshot (counts, top categories/brands)
 *   GET    /store/catalog          — paginated, filterable product list
 *   GET    /store/catalog/{sku}    — full product detail (active products only; 404 otherwise)
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
  ProductDetailResponse,
  PushCatalogRequest,
  PushCatalogResponse,
  PushStatusResponse,
  CancelJobResponse,
  RemoveCatalogRequest,
  RemoveCatalogResponse,
  PriceUpdateRequest,
  PriceUpdateResponse,
} from '@/types/api';

/**
 * Fetch the instant aggregate snapshot for this store's catalog.
 *
 * Previously routed through a Next.js server-side proxy (/api/catalog-summary)
 * to work around missing CORS headers on the backend. CORS is now fixed
 * on the backend, so this calls the endpoint directly via apiFetch like
 * every other API function.
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

  if (params?.min_cost       != null) query.set('min_cost',       String(params.min_cost));
  if (params?.max_cost       != null) query.set('max_cost',       String(params.max_cost));
  if (params?.min_list_price != null) query.set('min_list_price', String(params.min_list_price));
  if (params?.max_list_price != null) query.set('max_list_price', String(params.max_list_price));
  if (params?.min_margin     != null) query.set('min_margin',     String(params.min_margin));
  if (params?.in_stock_only)          query.set('in_stock_only',  'true');
  if (params?.sort_by)                query.set('sort_by',        params.sort_by);
  if (params?.sort_dir)               query.set('sort_dir',       params.sort_dir);
  for (const tag of (params?.tags ?? [])) query.append('tags', tag);
  if (params?.min_qty        != null) query.set('min_qty',          String(params.min_qty));
  if (params?.max_qty        != null) query.set('max_qty',          String(params.max_qty));
  if (params?.marketplace_clear)      query.set('marketplace_clear', 'true');

  const qs = query.toString();
  return apiFetch<CatalogResponse>(`/store/catalog${qs ? `?${qs}` : ''}`);
}

/**
 * Push products from the AOA pool into this store's Shopify catalog.
 *
 * Pass { skus: [...] } to push specific products, or { push_all: true }
 * to fill all remaining plan slots automatically.
 *
 * push_all responses:
 *   202 + { ok, job_started: true, job_id } — background job accepted; poll /store/catalog/push/status
 *   409 + { error: 'push_already_running', job_id, total_pushed } — job already in progress
 *   400 + plan_limit_exceeded detail — plan is full
 *
 * Specific-SKU pushes remain synchronous (200) and allow 3 min for large selections.
 */
export async function pushCatalog(
  request: PushCatalogRequest
): Promise<PushCatalogResponse> {
  const controller = new AbortController();
  // push_all returns HTTP 202 immediately, so 30s is plenty.
  // Specific-SKU pushes are synchronous (1 Shopify call/product) so allow 3 min for large selections.
  const timeoutMs = 'push_all' in request && request.push_all ? 30_000 : 3 * 60_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiFetch<PushCatalogResponse>('/store/catalog/push', {
      method: 'POST',
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
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

/**
 * Fetch full product detail for an active (pushed) SKU.
 *
 * Returns rich detail including images, description, physical specs,
 * all pricing tiers, and Shopify sync status.
 *
 * Rate limited to 60 calls/minute.
 * Returns 404 if the SKU is not in the store's active catalog.
 */
export async function getProductDetail(sku: string): Promise<ProductDetailResponse> {
  return apiFetch<ProductDetailResponse>(`/store/catalog/${encodeURIComponent(sku)}?include_pool=true`);
}

/**
 * Manually set the Shopify price for an active SKU.
 *
 * Only works when use_auto_pricing = false on store settings.
 * Backend returns:
 *   409 — store is in auto-pricing mode; switch to manual first
 *   404 — SKU is not in the store's active catalog
 *
 * On success show: "Price updated — syncing to Shopify."
 */
export async function patchProductPrice(
  sku: string,
  price: number
): Promise<PriceUpdateResponse> {
  const body: PriceUpdateRequest = { your_price: price };
  return apiFetch<PriceUpdateResponse>(
    `/store/catalog/${encodeURIComponent(sku)}/price`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

/**
 * Poll the live status of the current push_all background job.
 *
 * Returns { running: false } when idle, or full job progress when active.
 * Recommended poll interval: 5 seconds while running.
 */
export async function getPushStatus(): Promise<PushStatusResponse> {
  return apiFetch<PushStatusResponse>('/store/catalog/push/status');
}

/**
 * Cancel the running push_all background job for this store.
 *
 * After calling, continue polling getPushStatus() until running: false
 * (≈ 10–30 seconds to drain in-flight work). Then refresh slot counts.
 *
 * 404 = no job running (treat as already stopped).
 */
export async function cancelPushJob(): Promise<CancelJobResponse> {
  return apiFetch<CancelJobResponse>('/store/catalog/job/cancel', { method: 'DELETE' });
}
