/**
 * lib/api/collections.ts
 *
 * Shopify smart collections API.
 *
 * Endpoints:
 *   GET  /store/collections            — current collection state
 *   POST /store/collections/bootstrap  — create / rebuild smart collections
 *   POST /store/collections/reconcile  — check live Shopify state, remove stale DB entries
 *
 * Bootstrap is synchronous and can take 30–120 seconds for large catalogs.
 * Only available on Starter plan and above (plan.slug != "free").
 */

import { apiFetch } from './client';
import type {
  StoreCollectionsResponse,
  CollectionsBootstrapRequest,
  CollectionsBootstrapResponse,
  CollectionsReconcileResponse,
} from '@/types/api';

export async function getCollections(): Promise<StoreCollectionsResponse> {
  return apiFetch<StoreCollectionsResponse>('/store/collections');
}

/**
 * Reconcile the DB against live Shopify — removes stale records for collections
 * that were manually deleted in Shopify Admin.
 *
 * Call this before displaying collection counts so numbers are always accurate.
 * Rate-limited to 10/min by the backend.
 */
export async function reconcileCollections(): Promise<CollectionsReconcileResponse> {
  return apiFetch<CollectionsReconcileResponse>('/store/collections/reconcile', {
    method: 'POST',
  });
}

/**
 * Create or rebuild Shopify smart collections.
 *
 * Pass opts to include brand collections and/or set the minimum-SKU threshold.
 * These values are persisted to store settings automatically by the backend.
 * Safe to call multiple times — existing collections are reused, not duplicated.
 */
export async function bootstrapCollections(
  opts?: CollectionsBootstrapRequest
): Promise<CollectionsBootstrapResponse> {
  return apiFetch<CollectionsBootstrapResponse>('/store/collections/bootstrap', {
    method: 'POST',
    ...(opts ? { body: JSON.stringify(opts) } : {}),
  });
}
