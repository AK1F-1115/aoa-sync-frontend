/**
 * types/api.ts
 *
 * API request/response types for all backend communication.
 *
 * IMPORTANT: These types are based on ASSUMED backend contracts.
 * All assumed shapes are marked with @assumed.
 * Confirm with backend and remove the comment when verified.
 *
 * See ARCHITECTURE.md §Open Backend Contracts for full list of assumptions.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  message: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Billing Plans
// ---------------------------------------------------------------------------

/** @assumed — plan IDs based on typical Shopify billing plans */
export type BillingPlanId = 'starter' | 'growth' | 'pro';

/** @assumed — plan shape returned from GET /billing/plans */
export interface Plan {
  id: BillingPlanId;
  name: string;
  /** Monthly price in USD */
  price: number;
  features: string[];
  isPopular?: boolean;
  /** Free trial duration in days */
  trialDays?: number;
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

/** @assumed — subscription status values from Shopify recurring billing */
export type SubscriptionStatus = 'active' | 'pending' | 'cancelled' | 'frozen' | 'expired';

/** @assumed — subscription info shape returned from GET /subscription */
export interface SubscriptionInfo {
  planId: BillingPlanId | null;
  planName: string | null;
  status: SubscriptionStatus;
  /** Free trial days remaining, if applicable */
  trialDaysRemaining: number | null;
  /** Next billing date as ISO string, if applicable */
  billingOn: string | null;
  /** Shopify recurring application charge ID */
  chargeId: string | null;
}

// ---------------------------------------------------------------------------
// Billing — Subscribe
// ---------------------------------------------------------------------------

/** Request body for POST /billing/subscribe */
export interface BillingSubscribeRequest {
  /** The plan to subscribe to */
  plan: BillingPlanId;
  /**
   * Return URL — where Shopify should redirect after billing confirmation.
   * This is the billing/return page on this frontend.
   */
  returnUrl: string;
}

/** @assumed — response from POST /billing/subscribe */
export interface BillingSubscribeResponse {
  /**
   * Shopify billing confirmation URL.
   * Frontend must redirect the merchant to this URL.
   */
  confirmationUrl: string;
}

// ---------------------------------------------------------------------------
// Billing — Cancel
// ---------------------------------------------------------------------------

/** @assumed — response from POST /billing/cancel */
export interface BillingCancelResponse {
  success: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * @assumed — full dashboard response shape from GET /dashboard
 * Contains shop info, sync health, and subscription in one call
 * to minimize round trips on the main page load.
 */
export interface DashboardResponse {
  shop: {
    id: string;
    domain: string;
    name: string;
    email: string;
    shopifyPlan: string;
  };
  syncHealth: {
    lastRun: string | null;
    status: 'healthy' | 'warning' | 'error' | 'never_run';
    productsPushed: number;
    errorCount: number;
    lastSyncStatus: 'success' | 'partial' | 'failed' | null;
  };
  subscription: SubscriptionInfo;
}
