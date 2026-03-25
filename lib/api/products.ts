/**
 * lib/api/products.ts
 *
 * Catalog API — fetches products and summary data for the merchant's catalog.
 *
 * Endpoints (all authenticated with session token):
 *   GET /store/catalog/summary  — aggregate snapshot (counts, top categories/brands)
 *   GET /store/catalog          — paginated, filterable product list
 *
 * Multi-tenant safe: backend always filters by store_id from the session token.
 */

import { apiFetch } from '@/lib/api/client';
import type { CatalogResponse, CatalogParams, CatalogSummary } from '@/types/api';

/**
 * Fetch the instant aggregate snapshot for this store's catalog.
 * Fast — no pagination, returns pre-aggregated counts and top-15 lists.
 */
export async function getCatalogSummary(): Promise<CatalogSummary> {
  return apiFetch<CatalogSummary>('/store/catalog/summary');
}

/**
 * Fetch a paginated, filterable list of products in the store's catalog.
 *
 * @param params - page, page_size, search, supplier, category, brand
 */
export async function getCatalog(
  params?: CatalogParams
): Promise<CatalogResponse> {
  const query = new URLSearchParams();

  if (params?.page      != null) query.set('page',      String(params.page));
  if (params?.page_size != null) query.set('page_size', String(params.page_size));
  if (params?.search)            query.set('search',    params.search);
  if (params?.supplier)          query.set('supplier',  params.supplier);
  if (params?.category)          query.set('category',  params.category);
  if (params?.brand)             query.set('brand',     params.brand);

  const qs = query.toString();
  return apiFetch<CatalogResponse>(`/store/catalog${qs ? `?${qs}` : ''}`);
}
