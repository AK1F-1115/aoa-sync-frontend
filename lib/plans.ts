/**
 * lib/plans.ts
 *
 * Static plan definitions.
 *
 * Plans are defined here on the frontend rather than fetched from the API.
 * This is standard practice for Shopify apps — plan details rarely change
 * and don't need a round-trip to display. The plan slug is sent to the
 * backend when subscribing (POST /billing/subscribe { plan_slug }).
 *
 * To add a new plan: add it to STATIC_PLANS and update the backend.
 */

export interface StaticPlan {
  /** Numeric plan ID — sent as plan_id to POST /billing/subscribe */
  id: number;
  /** Plan slug — used for UI selection tracking */
  slug: string;
  name: string;
  /** Monthly price in USD */
  price: number;
  /** Features shown on the plan card */
  features: string[];
  /** Whether to show a "Most popular" badge */
  isPopular?: boolean;
  /** Free trial length in days */
  trialDays?: number;
}

export const STATIC_PLANS: StaticPlan[] = [
  {
    id: 2,
    slug: 'starter',
    name: 'Starter',
    price: 29.99,
    trialDays: 14,
    features: [
      'Up to 1,000 SKUs synced',
      'Automatic product sync',
      'Real-time inventory updates',
      'Email support',
    ],
  },
];
