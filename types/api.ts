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
   * The numeric plan ID to subscribe to (e.g. 2 for starter).
   * The backend reads shop_domain from the session token automatically.
   */
  plan_id: number;
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
  /** Whether the backend should automatically manage shipping profiles */
  auto_shipping_profiles: boolean;
  /** true = profiles exist and all variants are assigned */
  shipping_profiles_bootstrapped: boolean;
}

/** Request body for PATCH /store/settings — all fields optional */
export interface StoreSettingsUpdateRequest {
  markup_pct_retail?: number;
  markup_pct_vds?: number;
  markup_pct_wholesale?: number;
  auto_shipping_profiles?: boolean;
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
// Shipping Profiles
// ---------------------------------------------------------------------------

/** Response from GET /store/shipping */
export interface ShippingState {
  shipping_profiles_bootstrapped: boolean;
  auto_shipping_profiles: boolean;
  warehouse_profile_gid: string | null;
  dropship_profile_gid: string | null;
  /** Count of variants assigned to the warehouse profile */
  warehouse_products: number;
  /** Count of variants assigned to the dropship profile */
  dropship_products: number;
}

/** Success response from POST /store/shipping/bootstrap */
export interface ShippingBootstrapResponse {
  ok: boolean;
  warehouse_products: number;
  dropship_products: number;
  /** true if profiles were newly created; false if they already existed */
  created: boolean;
  message: string;
  /** true if bootstrap was skipped because auto_shipping_profiles=false */
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** A single product from GET /store/catalog */
export interface CatalogProduct {
  /** Internal AOA product / variant ID */
  id: string;
  /** Shopify product GID e.g. "gid://shopify/Product/123" */
  shopify_id: string;
  title: string;
  /** Supplier / vendor name */
  supplier: string | null;
  category: string | null;
  brand: string | null;
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
  /** Fulfillment type */
  fulfillment_type: 'warehouse' | 'dropship' | null;
  /** Whether this product is in the retail or VDS price tier */
  price_tier: 'retail' | 'vds' | 'wholesale' | null;
}

/** Paginated response from GET /store/catalog */
export interface CatalogResponse {
  products: CatalogProduct[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** Query params for GET /store/catalog */
export interface CatalogParams {
  page?: number;
  page_size?: number;
  search?: string;
  supplier?: string;
  category?: string;
  brand?: string;
}

/** Top-level aggregate from GET /store/catalog/summary */
export interface CatalogSummary {
  /** Total synced products */
  total_products: number;
  /** Products on the retail price tier */
  retail_count: number;
  /** Products on the VDS price tier */
  vds_count: number;
  /** Variants assigned to warehouse fulfilment */
  warehouse_count: number;
  /** Variants assigned to dropship fulfilment */
  dropship_count: number;
  /** Top 15 categories by product count */
  top_categories: { name: string; count: number }[];
  /** Top 15 brands by product count */
  top_brands: { name: string; count: number }[];
  /** ISO timestamp of the most recent sync */
  last_sync_at: string | null;
}
