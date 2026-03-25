/**
 * Root page — server component.
 *
 * Redirects to /dashboard, preserving Shopify's ?shop= and ?host= query params.
 * These params are injected by Shopify Admin when loading the embedded app and
 * are required by App Bridge for initialization.
 *
 * Route: GET /
 * After OAuth: backend redirects to APP_UI_URL?shop=...
 * This page then redirects to /dashboard?shop=...
 */

import { redirect } from 'next/navigation';

interface SearchParams {
  shop?: string;
  host?: string;
  [key: string]: string | string[] | undefined;
}

interface RootPageProps {
  // Next.js 15: searchParams is now a Promise for server components
  searchParams: Promise<SearchParams>;
}

export default async function RootPage({ searchParams }: RootPageProps) {
  // Await searchParams per Next.js 15 requirement for server components
  const resolvedParams = await searchParams;

  const params = new URLSearchParams();

  if (resolvedParams.shop) {
    params.set('shop', resolvedParams.shop);
  }
  if (resolvedParams.host) {
    params.set('host', resolvedParams.host);
  }

  const query = params.toString();
  const destination = query ? `/dashboard?${query}` : '/dashboard';

  redirect(destination);
}
