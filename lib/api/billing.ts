/**
 * lib/api/billing.ts
 *
 * Billing API calls — subscribe and cancel.
 *
 * @assumed — backend endpoint shapes are assumed. See ARCHITECTURE.md §Open Backend Contracts.
 * TODO(backend): Confirm POST /billing/subscribe and POST /billing/cancel response shapes.
 */

import { apiFetch } from './client';
import type {
  BillingSubscribeRequest,
  BillingSubscribeResponse,
  BillingCancelResponse,
  Plan,
} from '@/types/api';

/**
 * Fetches available billing plans.
 *
 * @assumed endpoint: GET /billing/plans
 * @assumed response: Plan[]
 *
 * TODO(backend): Confirm this endpoint exists or replace with hardcoded plans
 * if the backend does not serve them dynamically.
 */
export async function getPlans(): Promise<Plan[]> {
  return apiFetch<Plan[]>('/billing/plans');
}

/**
 * Subscribes the merchant to a billing plan.
 *
 * Flow:
 * 1. Frontend calls this with the selected plan
 * 2. Backend creates a Shopify recurring charge and returns confirmationUrl
 * 3. Frontend redirects to confirmationUrl (Shopify billing approval page)
 * 4. Merchant approves → Shopify redirects to backend callback
 * 5. Backend validates → redirects to APP_UI_URL/billing/return?status=success
 *
 * @assumed endpoint: POST /billing/subscribe
 * @assumed response: BillingSubscribeResponse { confirmationUrl: string }
 */
export async function subscribeToPlan(
  plan: BillingSubscribeRequest['plan'],
  returnUrl: string
): Promise<BillingSubscribeResponse> {
  const body: BillingSubscribeRequest = { plan, returnUrl };

  return apiFetch<BillingSubscribeResponse>('/billing/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Cancels the current subscription.
 *
 * @assumed endpoint: POST /billing/cancel
 * @assumed response: BillingCancelResponse { success: boolean }
 */
export async function cancelSubscription(): Promise<BillingCancelResponse> {
  return apiFetch<BillingCancelResponse>('/billing/cancel', {
    method: 'POST',
  });
}
