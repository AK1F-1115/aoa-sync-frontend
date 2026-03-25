'use client';

/**
 * app/billing/layout.tsx
 *
 * Minimal layout for the /billing/* routes (e.g. /billing/return).
 *
 * These routes are OUTSIDE the (embedded) route group — they run in a
 * standalone browser context after Shopify redirects back from billing
 * confirmation. App Bridge is NOT available here.
 *
 * This layout provides only the Polaris AppProvider context that all
 * Polaris components require. No Frame, no NavMenu, no App Bridge.
 */

import { AppProvider as PolarisProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';

interface BillingLayoutProps {
  children: React.ReactNode;
}

export default function BillingLayout({ children }: BillingLayoutProps) {
  return <PolarisProvider i18n={enTranslations}>{children}</PolarisProvider>;
}
