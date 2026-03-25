/**
 * lib/api/shipping.ts
 *
 * Shipping profiles API.
 *
 * Endpoints (all authenticated with session token):
 *   GET  /store/shipping           → current shipping profile state
 *   POST /store/shipping/bootstrap → create profiles + assign all variants
 *
 * Note: bootstrap is long-running (30–120 s for large stores).
 * The fetch uses a 150-second AbortSignal timeout to avoid browser cut-off.
 */

import { apiFetch } from '@/lib/api/client';
import type { ShippingState, ShippingBootstrapResponse } from '@/types/api';

/** Fetch the current shipping profile state for this store. */
export async function getShipping(): Promise<ShippingState> {
  return apiFetch<ShippingState>('/store/shipping');
}

/**
 * Trigger shipping profile creation + variant assignment.
 *
 * Long-running — up to 2 minutes for large stores. Uses a 150 s AbortSignal
 * so the request is not silently abandoned by the browser at 60 s.
 *
 * Throws ApiError:
 *   - 503: write_shipping scope missing — auto_shipping_profiles will be set
 *          to false on the backend; caller should refetch GET /store/settings.
 */
export async function bootstrapShipping(): Promise<ShippingBootstrapResponse> {
  // AbortSignal.timeout is available in all modern browsers and Node 18+.
  // Falls back to no timeout if not supported (older Safari).
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(150_000)
      : undefined;

  return apiFetch<ShippingBootstrapResponse>('/store/shipping/bootstrap', {
    method: 'POST',
    ...(signal ? { signal } : {}),
  });
}
