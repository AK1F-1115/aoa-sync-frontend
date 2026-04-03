/**
 * lib/api/wishlist.ts
 *
 * Wishlist API — persists a merchant's saved products on the backend.
 *
 * Endpoints (all authenticated with Shopify session token):
 *   GET    /store/wishlist          — list all saved items for this store
 *   POST   /store/wishlist          — save a product (idempotent: re-saving same SKU updates metadata)
 *   DELETE /store/wishlist/{sku}    — remove one item
 *   DELETE /store/wishlist          — clear all items for this store
 *
 * Multi-tenant safe: backend always filters by store_id from the session token.
 * Max items enforced server-side (200 per store).
 */

import { apiFetch } from '@/lib/api/client';
import type {
  WishlistResponse,
  WishlistAddRequest,
  WishlistAddResponse,
  WishlistRemoveResponse,
} from '@/types/api';

/** Fetch all saved wishlist items for the current store. */
export async function getWishlist(): Promise<WishlistResponse> {
  return apiFetch<WishlistResponse>('/store/wishlist');
}

/**
 * Save a product to the wishlist.
 * If the SKU already exists, the backend updates the stored metadata (name, price, etc.).
 */
export async function addToWishlist(item: WishlistAddRequest): Promise<WishlistAddResponse> {
  return apiFetch<WishlistAddResponse>('/store/wishlist', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

/** Remove a single product from the wishlist by SKU. Returns 404 if not found. */
export async function removeFromWishlist(sku: string): Promise<WishlistRemoveResponse> {
  return apiFetch<WishlistRemoveResponse>(
    `/store/wishlist/${encodeURIComponent(sku)}`,
    { method: 'DELETE' },
  );
}

/** Remove all wishlist items for the current store. */
export async function clearWishlist(): Promise<WishlistRemoveResponse> {
  return apiFetch<WishlistRemoveResponse>('/store/wishlist', { method: 'DELETE' });
}
