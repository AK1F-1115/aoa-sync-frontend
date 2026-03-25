/**
 * lib/api/subscription.ts
 *
 * Subscription status API calls.
 *
 * @assumed — endpoint shape is assumed. See ARCHITECTURE.md §Open Backend Contracts.
 * TODO(backend): Confirm GET /subscription response shape.
 */

import { apiFetch } from './client';
import type { SubscriptionInfo } from '@/types/api';

/**
 * Fetches the current merchant subscription status.
 *
 * @assumed endpoint: GET /subscription
 * @assumed response: SubscriptionInfo
 */
export async function getSubscription(): Promise<SubscriptionInfo> {
  return apiFetch<SubscriptionInfo>('/subscription');
}
