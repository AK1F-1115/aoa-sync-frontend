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
 * Waits for the Shopify global to be available, then returns it.
 *
 * App Bridge v4 initializes via a CDN script. On a fresh page load, there is a
 * race between React mounting + React Query firing and the CDN script setting
 * window.shopify. This function polls with a short delay rather than throwing
 * immediately, which prevents spurious crashes on fresh navigation.
 *
 * Times out after 5 seconds with a clear error.
 */
async function waitForShopify(): Promise<ShopifyGlobal> {
  if (typeof window === 'undefined') {
    throw new Error('[appBridge] waitForShopify() called in server context');
  }

  const shopify = (window as unknown as { shopify?: ShopifyGlobal }).shopify;
  if (shopify) return shopify;

  // Poll every 100ms, timeout after 5s
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const s = (window as unknown as { shopify?: ShopifyGlobal }).shopify;
      if (s) {
        clearInterval(interval);
        resolve(s);
        return;
      }
      if (Date.now() - start > 5000) {
        clearInterval(interval);
        reject(
          new Error(
            '[appBridge] window.shopify did not initialize within 5 seconds. ' +
            'Ensure this app is opened from inside Shopify Admin.'
          )
        );
      }
    }, 100);
  });
}

/**
 * Gets the Shopify global variable synchronously.
 * Throws immediately if not available. Use waitForShopify() for async contexts.
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
 * Returns true if the app is running inside the Shopify Admin iframe
 * (i.e. App Bridge has initialized and window.shopify is available).
 *
 * Use this to guard API calls or show a "not embedded" message.
 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { shopify?: ShopifyGlobal }).shopify;
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
  const shopify = await waitForShopify();
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
  void waitForShopify()
    .then((shopify) => shopify.toast.show(message, options))
    .catch(() => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[appBridge] showToast failed — not in embedded context');
      }
    });
}


