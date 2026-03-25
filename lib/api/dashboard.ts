/**
 * lib/api/dashboard.ts
 *
 * Merchant data — fetches from GET /store/me.
 *
 * This is the primary data endpoint for the embedded frontend.
 * Authentication: Shopify session token (Authorization: Bearer <shopify_jwt>).
 */

import { apiFetch } from './client';
import type { StoreMeResponse, BillingPlanId } from '@/types/api';
import type { DashboardData } from '@/types/merchant';

/**
 * Fetches merchant data from GET /store/me.
 *
 * Maps the backend's snake_case response to the frontend domain types.
 * Fields not included in the /store/me response are mapped to null.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const r = await apiFetch<StoreMeResponse>('/store/me');

  return {
    shop: {
      // /store/me only returns shop_domain — name falls back to domain
      id: r.shop_domain,
      domain: r.shop_domain,
      name: r.shop_domain,
      email: null,
      shopifyPlan: null,
    },
    syncHealth: {
      lastRun: r.last_sync_at,
      // Derive status from available data: if synced before → healthy, else never_run
      status: r.last_sync_at ? 'healthy' : 'never_run',
      productsPushed: r.products_synced,
      // Error count and last sync result are not in this endpoint
      errorCount: 0,
      lastSyncStatus: null,
    },
    subscription: {
      planId: (r.plan?.slug ?? null) as BillingPlanId | null,
      planName: r.plan?.name ?? null,
      status: r.subscription_status ?? 'cancelled',
      trialDaysRemaining: r.trial_days_remaining,
      // trial_ends_at doubles as next billing date for trial merchants
      billingOn: r.trial_ends_at,
      chargeId: null,
    },
  };
}
