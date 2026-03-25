'use client';

/**
 * components/NavMenu.tsx
 *
 * App Bridge v4 NavMenu — adds items to Shopify Admin's left sidebar.
 *
 * In App Bridge v4, NavMenu is a web component wrapper.
 * Navigation links are rendered as anchor (<a>) children inside NavMenu.
 * The App Bridge CDN script handles routing them through the Shopify Admin frame.
 *
 * Must be rendered inside the Polaris AppProvider context (EmbeddedShell).
 *
 * See: https://shopify.dev/docs/api/app-bridge-library/react-components/navmenu
 */

import { NavMenu as AppBridgeNavMenu } from '@shopify/app-bridge-react';

export function NavMenu() {
  return (
    <AppBridgeNavMenu>
      {/* 
       * App Bridge v4 NavMenu uses anchor tags as children.
       * The href values match the Next.js routes in app/(embedded)/.
       * Note: rel="home" marks the default active item.
       */}
      <a href="/dashboard" rel="home">
        Dashboard
      </a>
      <a href="/plans">Plans</a>
      <a href="/subscription">Subscription</a>
      <a href="/settings">Settings</a>
      <a href="/orders">Orders</a>
    </AppBridgeNavMenu>
  );
}
