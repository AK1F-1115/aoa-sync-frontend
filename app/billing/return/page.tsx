'use client';

/**
 * app/billing/return/page.tsx
 *
 * Billing confirmation return handler.
 *
 * This page is OUTSIDE the (embedded) route group — intentionally.
 *
 * Reason: After a Shopify billing confirmation, the backend redirects here:
 *   https://app.aoatraders.com/billing/return?shop=...&status=success|pending|failed
 *
 * At this point, the ?host= param may be absent, so App Bridge cannot be
 * initialized reliably. This page handles the result without App Bridge
 * and provides a manual link back to the app.
 *
 * States:
 * - success: Subscription activated. Link to Dashboard.
 * - pending: Awaiting Shopify approval. Instructions + link to Subscription.
 * - failed: Something went wrong. Link to Plans.
 * - (missing): Unknown state fallback.
 *
 * SECURITY NOTE:
 * The `status` param is display-only. Actual subscription state is determined
 * by the backend — never trust this param for business logic.
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

type BillingStatus = 'success' | 'pending' | 'failed';

function isBillingStatus(value: string | null): value is BillingStatus {
  return value === 'success' || value === 'pending' || value === 'failed';
}

// ---------------------------------------------------------------------------
// Content based on status
// ---------------------------------------------------------------------------

function BillingReturnContent() {
  const searchParams = useSearchParams();
  const rawStatus = searchParams.get('status');
  const status: BillingStatus | 'unknown' = isBillingStatus(rawStatus)
    ? rawStatus
    : 'unknown';

  if (status === 'success') {
    return (
      <Page title="Subscription activated">
        <Layout>
          <Layout.Section>
            <Banner
              title="You're all set!"
              tone="success"
            >
              <Text as="p">
                Your subscription has been activated. You can now sync your
                products to AOA Traders.
              </Text>
            </Banner>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  What happens next
                </Text>
                <Text as="p">
                  Your first product sync will run shortly. You can monitor sync
                  health from your dashboard.
                </Text>
                <InlineStack gap="300">
                  <Button variant="primary" url="/dashboard">
                    Go to Dashboard
                  </Button>
                  <Button url="/subscription" variant="plain">
                    View subscription
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (status === 'pending') {
    return (
      <Page title="Subscription pending">
        <Layout>
          <Layout.Section>
            <Banner
              title="Awaiting billing approval"
              tone="warning"
            >
              <Text as="p">
                Your subscription is pending approval from Shopify. This
                typically resolves within a few minutes.
              </Text>
            </Banner>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  While you wait
                </Text>
                <Text as="p">
                  Check your subscription status page to see when the billing
                  is confirmed. You can also refresh the page after a minute.
                </Text>
                <InlineStack gap="300">
                  <Button variant="primary" url="/subscription">
                    Check subscription status
                  </Button>
                  <Button url="/dashboard" variant="plain">
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

  if (status === 'failed') {
    return (
      <Page title="Subscription failed">
        <Layout>
          <Layout.Section>
            <Banner
              title="Something went wrong"
              tone="critical"
            >
              <Text as="p">
                Your subscription could not be completed. You were not charged.
                Please try again or contact support if the problem persists.
              </Text>
            </Banner>
          </Layout.Section>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="p">
                  You can try subscribing again from the Plans page.
                </Text>
                <InlineStack gap="300">
                  <Button variant="primary" url="/plans">
                    View Plans
                  </Button>
                  <Button url="/dashboard" variant="plain">
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

  // Unknown / missing status fallback
  return (
    <Page title="Billing return">
      <Layout>
        <Layout.Section>
          <Banner title="Unexpected state" tone="warning">
            <Text as="p">
              We couldn&apos;t determine the result of your billing request. Please
              check your subscription status or contact support.
            </Text>
          </Banner>
        </Layout.Section>
        <Layout.Section>
          <Button url="/subscription">Check subscription</Button>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Exported page with Suspense (required for useSearchParams in App Router)
// ---------------------------------------------------------------------------

export default function BillingReturnPage() {
  return (
    <Suspense
      fallback={
        <Page title="Processing...">
          <Layout>
            <Layout.Section>
              <Text as="p">Checking your billing status...</Text>
            </Layout.Section>
          </Layout>
        </Page>
      }
    >
      <BillingReturnContent />
    </Suspense>
  );
}
