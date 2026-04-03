/**
 * lib/hooks/useWatchlist.ts
 *
 * localStorage-backed watchlist (shopping list) for product research.
 *
 * Merchants can save products while browsing the Available Catalog, then review
 * their watchlist before deciding what to push to Shopify. The list persists
 * across page reloads and browser sessions on the same device.
 *
 * Storage key: 'aoa_watchlist'
 * Max items:   200 (oldest dropped when exceeded)
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'aoa_watchlist';
const MAX_ITEMS = 200;

export interface WatchlistEntry {
  sku: string;
  name: string | null;
  image_url: string | null;
  merchant_cost: string | null;
  list_price: string | null;
  brand: string | null;
  category: string | null;
  /** ISO 8601 timestamp when the item was saved */
  added_at: string;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function readStorage(): WatchlistEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: WatchlistEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistEntry[]>(() => readStorage());

  const isInWatchlist = useCallback(
    (sku: string) => items.some((i) => i.sku === sku),
    [items],
  );

  const addToWatchlist = useCallback(
    (entry: Omit<WatchlistEntry, 'added_at'>) => {
      setItems((prev) => {
        if (prev.some((i) => i.sku === entry.sku)) return prev; // already saved
        const updated: WatchlistEntry[] = [
          { ...entry, added_at: new Date().toISOString() },
          ...prev,
        ].slice(0, MAX_ITEMS);
        writeStorage(updated);
        return updated;
      });
    },
    [],
  );

  const removeFromWatchlist = useCallback((sku: string) => {
    setItems((prev) => {
      const updated = prev.filter((i) => i.sku !== sku);
      writeStorage(updated);
      return updated;
    });
  }, []);

  const toggleWatchlist = useCallback(
    (entry: Omit<WatchlistEntry, 'added_at'>) => {
      setItems((prev) => {
        if (prev.some((i) => i.sku === entry.sku)) {
          // Remove
          const updated = prev.filter((i) => i.sku !== entry.sku);
          writeStorage(updated);
          return updated;
        } else {
          // Add
          const updated: WatchlistEntry[] = [
            { ...entry, added_at: new Date().toISOString() },
            ...prev,
          ].slice(0, MAX_ITEMS);
          writeStorage(updated);
          return updated;
        }
      });
    },
    [],
  );

  const clearWatchlist = useCallback(() => {
    setItems([]);
    writeStorage([]);
  }, []);

  return {
    items,
    isInWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatchlist,
    clearWatchlist,
  };
}
