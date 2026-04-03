/**
 * lib/hooks/useWatchlist.ts
 *
 * Backend-persisted watchlist hook (React Query).
 *
 * All mutations use optimistic updates so the UI responds instantly —
 * the server is updated in the background. On any error the optimistic
 * change is rolled back automatically.
 *
 * The hook interface is intentionally identical to the old localStorage
 * version so the rest of the codebase needs no changes.
 *
 * Backend contract (all authenticated via Shopify JWT):
 *   GET    /store/wishlist          → WishlistResponse
 *   POST   /store/wishlist          → WishlistAddResponse   (body: WishlistAddRequest)
 *   DELETE /store/wishlist/{sku}    → WishlistRemoveResponse
 *   DELETE /store/wishlist          → WishlistRemoveResponse  (clear all)
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} from '@/lib/api/wishlist';
import type { WishlistItem, WishlistResponse } from '@/types/api';

// ---------------------------------------------------------------------------
// Re-export type alias so consumers keep using WatchlistEntry
// ---------------------------------------------------------------------------

/** Identical to WishlistItem — aliased so page components need no import changes. */
export type WatchlistEntry = WishlistItem;

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

const QUERY_KEY = ['wishlist'] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWatchlist() {
  const queryClient = useQueryClient();

  // ── Fetch ────────────────────────────────────────────────────────────────
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getWishlist,
    staleTime: 5 * 60_000,
    // Keep showing existing data while refetching — no loading flash
    placeholderData: (prev) => prev,
  });

  const items: WatchlistEntry[] = data?.items ?? [];

  // ── Add ──────────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (item: Omit<WatchlistEntry, 'added_at'>) => addToWishlist({ ...item }),
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<WishlistResponse>(QUERY_KEY);
      queryClient.setQueryData<WishlistResponse>(QUERY_KEY, (old) => ({
        items: [
          { ...newItem, added_at: new Date().toISOString() },
          ...(old?.items.filter((i) => i.sku !== newItem.sku) ?? []),
        ].slice(0, 200),
      }));
      return { previous };
    },
    onError: (_err, _item, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });

  // ── Remove ───────────────────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: (sku: string) => removeFromWishlist(sku),
    onMutate: async (sku) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<WishlistResponse>(QUERY_KEY);
      queryClient.setQueryData<WishlistResponse>(QUERY_KEY, (old) => ({
        items: old?.items.filter((i) => i.sku !== sku) ?? [],
      }));
      return { previous };
    },
    onError: (_err, _sku, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });

  // ── Clear all ─────────────────────────────────────────────────────────────
  const clearMutation = useMutation({
    mutationFn: () => clearWishlist(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<WishlistResponse>(QUERY_KEY);
      queryClient.setQueryData<WishlistResponse>(QUERY_KEY, { items: [] });
      return { previous };
    },
    onError: (_err, _v, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });

  // ── Public interface (same shape as before) ───────────────────────────────
  const isInWatchlist = useCallback(
    (sku: string) => items.some((i) => i.sku === sku),
    [items],
  );

  const addToWatchlist = useCallback(
    (entry: Omit<WatchlistEntry, 'added_at'>) => { addMutation.mutate(entry); },
    [addMutation],
  );

  const removeFromWatchlist = useCallback(
    (sku: string) => { removeMutation.mutate(sku); },
    [removeMutation],
  );

  const toggleWatchlist = useCallback(
    (entry: Omit<WatchlistEntry, 'added_at'>) => {
      if (items.some((i) => i.sku === entry.sku)) {
        removeMutation.mutate(entry.sku);
      } else {
        addMutation.mutate(entry);
      }
    },
    [items, addMutation, removeMutation],
  );

  const clearWatchlistItems = useCallback(() => { clearMutation.mutate(); }, [clearMutation]);

  return {
    items,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    clearWatchlist: clearWatchlistItems,
  };
}

