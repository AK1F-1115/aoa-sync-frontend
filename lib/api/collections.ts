/**
 * lib/api/collections.ts
 *
 * Shopify smart collections API.
 *
 * Endpoints:
 *   GET  /store/collections            — current collection state
 *   POST /store/collections/bootstrap  — create / rebuild smart collections
 *
 * Bootstrap is synchronous and can take 30–120 seconds for large catalogs.
 * Only available on Starter plan and above (plan.slug != "free").
 */

import { apiFetch } from './client';
import type {
  StoreCollectionsResponse,
  CollectionsBootstrapResponse,
} from '@/types/api';

export async function getCollections(): Promise<StoreCollectionsResponse> {
  return apiFetch<StoreCollectionsResponse>('/store/collections');
}

export async function bootstrapCollections(): Promise<CollectionsBootstrapResponse> {
  return apiFetch<CollectionsBootstrapResponse>('/store/collections/bootstrap', {
    method: 'POST',
  });
}
