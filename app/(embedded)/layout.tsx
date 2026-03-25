/**
 * app/(embedded)/layout.tsx
 *
 * Embedded route group layout.
 *
 * All pages under (embedded)/ will have:
 * - App Bridge initialized (session token, host management)
 * - Polaris AppProvider + Frame
 * - Shopify Admin sidebar navigation (NavMenu)
 *
 * This is a server component — the EmbeddedShell client component
 * handles all client-side initialization.
 *
 * Note: This route group does NOT affect the URL path.
 * /dashboard, /plans, /subscription, /orders all work as expected.
 */

import type { Metadata } from 'next';
import { EmbeddedShell } from '@/components/EmbeddedShell';

export const metadata: Metadata = {
  title: {
    template: '%s | AOA Sync',
    default: 'AOA Sync',
  },
};

export default function EmbeddedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EmbeddedShell>{children}</EmbeddedShell>;
}
