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

/** @confirmed — plan slugs returned by GET /billing/plans */
export type BillingPlanId = 'free' | 'starter' | 'growth' | 'pro';

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

/** Subscription status values returned by the backend. */
export type SubscriptionStatus = 'free' | 'trial' | 'active' | 'pending' | 'cancelled' | 'frozen' | 'expired';

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
  /**
   * The plan slug to subscribe to (e.g. "starter").
   * The backend reads shop_domain from the session token automatically.
   */
  plan_slug: string;
}

/** Response from POST /billing/subscribe */
export interface BillingSubscribeResponse {
  /**
   * Shopify billing confirmation URL (snake_case from backend).
   * Frontend must redirect the merchant to this URL.
   */
  confirmation_url: string;
}

// ---------------------------------------------------------------------------
// Billing — Cancel
// ---------------------------------------------------------------------------

/** Response from POST /store/billing/cancel */
export interface BillingCancelResponse {
  ok: boolean;
  /** ISO 8601 UTC — when the store's products will be removed */
  cleanup_after: string;
  /** Human-readable message to show the merchant */
  message: string;
}

// ---------------------------------------------------------------------------
// Store / Merchant endpoint
// ---------------------------------------------------------------------------

/**
 * Response from GET /store/me
 * Primary merchant data endpoint for the embedded frontend.
 * Authenticated with Shopify session token (Authorization: Bearer <token>).
 */
export interface StoreMeResponse {
  /** myshopify.com domain e.g. "example.myshopify.com" */
  shop_domain: string;
  /** Whether the store is active / installed */
  active: boolean;
  /** Current subscription status, or null if never subscribed */
  subscription_status: SubscriptionStatus | null;
  /** ISO 8601 — when the trial expires, or null */
  trial_ends_at: string | null;
  /** Days remaining in trial, or null if not on trial */
  trial_days_remaining: number | null;
  /** ISO 8601 — when the merchant subscribed, or null */
  subscribed_at: string | null;
  /** Current assigned plan, or null if none */
  plan: {
    slug: string;
    name: string;
    /** Monthly price in USD as a string e.g. "29.99" */
    price_usd: string;
    sku_limit: number;
    trial_days: number;
  } | null;
  /** Total active synced variants for this store */
  products_synced: number;
  /** ISO 8601 UTC timestamp of last sync, or null */
  last_sync_at: string | null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Response from GET /store/settings */
export interface StoreSettingsResponse {
  /** Decimal ratio e.g. 0.25 = 25% */
  markup_pct_retail: number;
  markup_pct_vds: number;
  markup_pct_wholesale: number;
  collections_bootstrapped: boolean;
  collections_count: number;
}

/** Request body for PATCH /store/settings — all fields optional */
export interface StoreSettingsUpdateRequest {
  markup_pct_retail?: number;
  markup_pct_vds?: number;
  markup_pct_wholesale?: number;
}

/** Response from PATCH /store/settings */
export interface StoreSettingsUpdateResponse {
  ok: boolean;
  markup_changed: boolean;
  /** 'queued' | 'not_needed' */
  price_sync: 'queued' | 'not_needed';
  products_affected: number;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** Response from GET /store/collections */
export interface StoreCollectionsResponse {
  collections_bootstrapped: boolean;
  category_collections: number;
  brand_collections: number;
  total: number;
}

/** Response from POST /store/collections/bootstrap */
export interface CollectionsBootstrapResponse {
  ok: boolean;
  collections_bootstrapped: boolean;
  category_collections: number;
  brand_collections: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type ProductStatus = 'active' | 'draft' | 'archived';

/** A single product pushed from AOA to the merchant's Shopify store. */
export interface StoreProduct {
  /** Internal AOA product ID */
  id: string;
  /** Shopify product GID or numeric ID */
  shopify_id: string;
  title: string;
  vendor: string | null;
  product_type: string | null;
  handle: string;
  status: ProductStatus;
  /** Primary image URL */
  image_url: string | null;
  variants_count: number;
  /** Lowest variant price as a decimal string e.g. "9.99" */
  price_min: string;
  /** Highest variant price as a decimal string e.g. "49.99" */
  price_max: string;
  /** ISO timestamp of last sync for this product */
  synced_at: string | null;
  /** SKU of the default / first variant */
  sku: string | null;
}

/** Paginated response from GET /store/products */
export interface StoreProductsResponse {
  products: StoreProduct[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

/** Query params for GET /store/products */
export interface StoreProductsParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: ProductStatus;
}
