/**
 * types/merchant.ts
 *
 * Core domain types for merchant, shop, and sync health.
 * These are designed to be extensible for future WorkOS user context.
 */

// ---------------------------------------------------------------------------
// Shop / Store
// ---------------------------------------------------------------------------

export interface ShopInfo {
  /** Internal shop ID from backend */
  id: string;
  /** myshopify.com domain e.g. "example.myshopify.com" */
  domain: string;
  /** Display name of the shop — falls back to domain if not returned by API */
  name: string;
  /** Shop owner email — may be null if not returned by the current endpoint */
  email: string | null;
  /** Shopify plan name — may be null if not returned by the current endpoint */
  shopifyPlan: string | null;
}

// ---------------------------------------------------------------------------
// Sync Health
// ---------------------------------------------------------------------------

export type SyncStatus = 'healthy' | 'warning' | 'error' | 'never_run';
export type LastSyncResult = 'success' | 'partial' | 'failed' | null;

export interface SyncHealth {
  /** ISO timestamp of the last sync run */
  lastRun: string | null;
  /** Overall sync health status */
  status: SyncStatus;
  /** Total products pushed to AOA in the last sync */
  productsPushed: number;
  /** Number of errors in the last sync */
  errorCount: number;
  /** Result of the most recent sync attempt */
  lastSyncStatus: LastSyncResult;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardData {
  shop: ShopInfo;
  syncHealth: SyncHealth;
  subscription: import('./api').SubscriptionInfo;
}

// ---------------------------------------------------------------------------
// Session / Auth context
//
// Designed to be extensible for WorkOS.
// Currently only Shopify merchant context is used.
// When WorkOS is added, 'user' field will be populated from WorkOS session.
// ---------------------------------------------------------------------------

export interface SessionUser {
  /**
   * WorkOS user ID (future — null until feature/workos-auth)
   */
  workosUserId: string | null;

  /**
   * User email — from WorkOS when available
   */
  email: string | null;

  /**
   * User display name
   */
  name: string | null;

  /**
   * Role — used for admin panel access
   * 'merchant' | 'admin' | 'viewer' (future)
   */
  role: 'merchant' | 'admin' | 'viewer' | null;
}

/**
 * Merchant context — combines shop data with session user.
 * Currently only shop is populated. User will come from WorkOS later.
 */
export interface MerchantContext {
  shop: ShopInfo | null;
  user: SessionUser | null;
  isLoading: boolean;
  error: Error | null;
}
