/**
 * lib/api/billing.ts
 *
 * Billing API calls.
 *
 * Endpoints:
 *   GET  /billing/plans     — public, no auth
 *   POST /billing/subscribe — requires session token
 *   POST /billing/cancel    — requires session token
 */

import { apiFetch, apiFetchPublic } from './client';
import { STATIC_PLANS } from '@/lib/plans';
import type { StaticPlan } from '@/lib/plans';
import type {
  BillingSubscribeRequest,
  BillingSubscribeResponse,
  BillingCancelResponse,
} from '@/types/api';

/**
 * Shape returned by GET /billing/plans.
 * Public endpoint — no auth required.
 * Uses snake_case consistent with other backend responses.
 */
interface ApiPlanItem {
  id: number;
  slug: string;
  name: string;
  /** Monthly price in USD as a string e.g. "29.99" */
  price_usd: string;
  sku_limit: number;
  trial_days: number;
  /** Optional — backend may or may not include a features array */
  features?: string[];
  is_popular?: boolean;
}

/**
 * Fetches available billing plans from the backend.
 *
 * GET /billing/plans — public, no auth required.
 *
 * Maps backend snake_case response to the StaticPlan shape used by the UI.
 * If the API returns a features array it is used directly; otherwise features
 * are derived from sku_limit.
 */
export async function getPlans(): Promise<StaticPlan[]> {
  const items = await apiFetchPublic<ApiPlanItem[]>('/billing/plans');
  return items.map((item): StaticPlan => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    price: parseFloat(item.price_usd),
    trialDays: item.trial_days,
    isPopular: item.is_popular ?? false,
    features: item.features ?? [
      `Up to ${item.sku_limit.toLocaleString()} SKUs synced`,
      'Automatic product sync',
      'Real-time inventory updates',
      'Email support',
    ],
  }));
}

/**
 * Subscribes the merchant to a billing plan.
 *
 * Flow:
 * 1. Frontend calls this with the selected plan slug
 * 2. Backend reads shop_domain from the Shopify session token automatically
 * 3. Backend creates a Shopify recurring charge and returns confirmationUrl
 * 4. Frontend redirects to confirmationUrl (Shopify billing approval page)
 * 5. Merchant approves → Shopify redirects to backend callback
 * 6. Backend validates → redirects to APP_UI_URL/billing/return?status=success
 *
 * The Authorization header is attached automatically by apiFetch().
 *
 * @confirmed endpoint: POST /billing/subscribe
 * @confirmed body: { plan_slug: string }
 * @confirmed response: BillingSubscribeResponse { confirmationUrl: string }
 */
export async function subscribeToPlan(
  planId: BillingSubscribeRequest['plan_id']
): Promise<BillingSubscribeResponse> {
  return apiFetch<BillingSubscribeResponse>('/billing/subscribe', {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId }),
  });
}

/**
 * Cancels the current subscription.
 *
 * Products stay live for 3 days after cancellation, then are removed.
 *
 * @confirmed endpoint: POST /store/billing/cancel
 * @confirmed response: BillingCancelResponse { ok, cleanup_after, message }
 */
export async function cancelSubscription(): Promise<BillingCancelResponse> {
  return apiFetch<BillingCancelResponse>('/store/billing/cancel', {
    method: 'POST',
  });
}
