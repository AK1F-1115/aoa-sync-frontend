'use client';

/**
 * app/billing/page.tsx
 *
 * Handles backend redirects after paid-plan billing confirmation fails.
 *
 * The backend redirects here on failure:
 *   https://app.aoatraders.com/billing?shop={shop}&error=activation_failed
 *
 * On success the backend redirects directly to /dashboard — this page is
 * only reached when something went wrong.
 *
 * This route is OUTSIDE the (embedded) route group.
 * App Bridge is NOT available here — uses standalone Polaris only.
 */

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  Page,
  Layout,
  Banner,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
} from '@shopify/polaris';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function BillingPageContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const shop  = searchParams.get('shop');

  // Build the settings deep-link back into the embedded app if we have shop.
  // e.g. https://app.aoatraders.com/settings?shop=store.myshopify.com
  const settingsUrl = shop ? `/settings?shop=${shop}` : '/settings';
  const dashboardUrl = shop ? `/dashboard?shop=${shop}` : '/dashboard';

  if (error === 'activation_failed') {
    return (
      <Page title="Billing activation failed">
        <Layout>
          <Layout.Section>
            <Banner title="Could not activate your subscription" tone="critical">
              <Text as="p">
                Shopify was unable to activate your billing plan. You were not
                charged. Please try again — if the problem persists, contact
                support.
              </Text>
            </Banner>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">What to do next</Text>
                <Text as="p">
                  Go back to Settings and select your plan again to retry. If
                  you see a pending charge in Shopify, it will be voided
                  automatically.
                </Text>
                <InlineStack gap="300">
                  <Button variant="primary" url={settingsUrl}>
                    Back to Settings
                  </Button>
                  <Button variant="plain" url={dashboardUrl}>
                    Go to Dashboard
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Generic fallback for unknown ?error= values or direct navigation.
  return (
    <Page title="Billing">
      <Layout>
        <Layout.Section>
          <Banner title="Unexpected billing state" tone="warning">
            <Text as="p">
              We couldn&apos;t determine the result of your billing request.
              Please check your subscription status or contact support.
            </Text>
          </Banner>
        </Layout.Section>
        <Layout.Section>
          <InlineStack gap="300">
            <Button variant="primary" url={settingsUrl}>
              Back to Settings
            </Button>
            <Button variant="plain" url={dashboardUrl}>
              Go to Dashboard
            </Button>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Export with Suspense (required for useSearchParams in App Router)
// ---------------------------------------------------------------------------

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <Page title="Billing">
          <Layout>
            <Layout.Section>
              <Text as="p">Loading billing information...</Text>
            </Layout.Section>
          </Layout>
        </Page>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}
