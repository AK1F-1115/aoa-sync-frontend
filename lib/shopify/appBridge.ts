/**
 * lib/shopify/appBridge.ts
 *
 * App Bridge v4 utilities.
 *
 * In App Bridge v4, initialization is done via:
 * 1. <meta name="shopify-api-key"> in the HTML <head>
 * 2. <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js">
 *
 * This exposes a global `shopify` variable (type: ShopifyGlobal).
 * There is no longer a React Provider or ClientApplication to pass around.
 *
 * Session tokens are obtained via: shopify.idToken()
 *
 * See: https://shopify.dev/docs/api/app-bridge-library
 */

import type { ShopifyGlobal } from '@shopify/app-bridge-types';

/**
 * Gets the Shopify global variable.
 * This is available after the App Bridge CDN script has loaded.
 * Only available in browser context.
 */
function getShopify(): ShopifyGlobal {
  if (typeof window === 'undefined') {
    throw new Error('[appBridge] getShopify() called in server context');
  }
  const shopify = (window as unknown as { shopify?: ShopifyGlobal }).shopify;
  if (!shopify) {
    throw new Error(
      '[appBridge] shopify global not found. Ensure the App Bridge CDN script is loaded.'
    );
  }
  return shopify;
}

/**
 * Retrieves a fresh Shopify ID token from App Bridge v4.
 *
 * This token is a signed JWT that:
 * - Is valid for a short time (~1 minute)
 * - Must be sent as Authorization: Bearer to the backend
 * - Is validated by the backend against Shopify's API
 *
 * Never cache this token — call fresh before each API request.
 */
export async function getSessionToken(): Promise<string> {
  const shopify = getShopify();
  return shopify.idToken();
}

/**
 * Shows a toast notification via App Bridge.
 * Convenience wrapper around shopify.toast.show().
 */
export function showToast(
  message: string,
  options?: { isError?: boolean; duration?: number }
): void {
  try {
    const shopify = getShopify();
    shopify.toast.show(message, options);
  } catch {
    // Silently ignore in server or non-embedded context
    if (process.env.NODE_ENV === 'development') {
      console.warn('[appBridge] showToast failed — not in embedded context');
    }
  }
}

/**
 * Returns whether the app is running in an embedded Shopify context.
 * Checks for the shopify global variable as a signal.
 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { shopify?: ShopifyGlobal }).shopify;
}

