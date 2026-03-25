/**
 * lib/api/dashboard.ts
 *
 * Dashboard API calls.
 *
 * @assumed — backend endpoint shape is assumed. See ARCHITECTURE.md §Open Backend Contracts.
 * TODO(backend): Confirm GET /dashboard response shape with backend team.
 */

import { apiFetch } from './client';
import type { DashboardResponse } from '@/types/api';
import type { DashboardData } from '@/types/merchant';

/**
 * Fetches dashboard data including shop info, sync health, and subscription.
 *
 * @assumed endpoint: GET /dashboard
 * @assumed response: DashboardResponse
 */
export async function getDashboardData(): Promise<DashboardData> {
  const response = await apiFetch<DashboardResponse>('/dashboard');

  // Map API response to domain type
  return {
    shop: {
      id: response.shop.id,
      domain: response.shop.domain,
      name: response.shop.name,
      email: response.shop.email,
      shopifyPlan: response.shop.shopifyPlan,
    },
    syncHealth: {
      lastRun: response.syncHealth.lastRun,
      status: response.syncHealth.status,
      productsPushed: response.syncHealth.productsPushed,
      errorCount: response.syncHealth.errorCount,
      lastSyncStatus: response.syncHealth.lastSyncStatus,
    },
    subscription: response.subscription,
  };
}
