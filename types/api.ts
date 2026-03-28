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

/**
 * Response from POST /billing/subscribe.
 * Discriminated union — shape depends on whether the plan is free or paid.
 */
export type BillingSubscribeResponse =
  | {
      /** Paid plan — redirect merchant here for Shopify billing approval. */
      confirmation_url: string;
      activated?: never;
    }
  | {
      /** Free plan — already activated server-side, no Shopify redirect needed. */
      activated: true;
      plan: string;
      sku_limit: number;
      confirmation_url?: never;
    };

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

/** A single product row from GET /store/catalog */
export interface CatalogProduct {
  /** AOA internal SKU (formerly supplier_sku / product_id) */
  aoa_sku: string;
  /** 'retail' (Essendant warehouse) or 'vds' (Essendant VDS dropship) */
  product_type: 'retail' | 'vds' | null;
  /** Product name via COALESCE join on products / vds_products */
  product_name: string | null;
  /** Top-level Essendant category e.g. "OFFICE SUPPLIES" */
  category_1: string | null;
  brand: string | null;
  /** Full Shopify GID e.g. "gid://shopify/Product/123"; null if not yet pushed */
  shopify_product_id: string | null;
  /** What AOA charges the merchant: cost_price × (1 + plan.aoa_markup_pct); null if no plan or cost missing */
  aoa_cost: string | null;
  /** What customers pay on Shopify: aoa_cost × (1 + store.shopify_markup_pct); null if not yet price-synced */
  list_price: string | null;
  /** Last quantity pushed to Shopify; null = not yet synced */
  last_synced_quantity: number | null;
  /** "ACTIVE" | "DRAFT" | null */
  last_shopify_status: string | null;
  /** "warehouse" | "dropship" | null */
  shipping_profile_key: string | null;
  /** 1 = standard, 2 = VDS quantity-break */
  variant_tier: number | null;
  /** "R" = warehouse, "S"/"N" = dropship; null for VDS */
  stocking_indicator: string | null;
}

/** Paginated response from GET /store/catalog */
export interface CatalogResponse {
  /** FastAPI pagination key — may be 'items' or 'products' depending on backend */
  items?: CatalogProduct[];
  products?: CatalogProduct[];
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
  /** Total active synced variants (active=true rows in shopify_variant_map) */
  total_active: number;
  /** Essendant (warehouse/retail) variant count */
  retail_count: number;
  /** Essendant VDS (dropship) variant count */
  vds_count: number;
  /** Variants assigned to warehouse shipping profile */
  warehouse_count: number;
  /** Variants assigned to dropship shipping profile */
  dropship_count: number;
  /** Variants not yet assigned to any shipping profile */
  unassigned_count: number;
  /** Top 15 categories by variant count */
  categories: { name: string; count: number }[];
  /** Top 15 brands by variant count */
  brands: { name: string; count: number }[];
  /** ISO timestamp of the most recent sync */
  last_sync_at: string | null;
}
