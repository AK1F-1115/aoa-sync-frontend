'use client';

/**
 * app/(embedded)/orders/page.tsx
 *
 * Orders page — placeholder for upcoming order queue feature.
 *
 * Clearly marked as "Coming Soon" using Polaris EmptyState.
 * This ensures the navigation item works and the app looks complete
 * for Shopify app review purposes.
 */

import { Page } from '@shopify/polaris';
import { EmptyState } from '@shopify/polaris';

export default function OrdersPage() {
  return (
    <Page fullWidth title="Orders">
      <EmptyState
        heading="Order queue coming soon"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>
          The order management queue is currently in development. This feature
          will allow you to view and manage orders synced between your Shopify
          store and AOA Traders.
        </p>
      </EmptyState>
    </Page>
  );
}
