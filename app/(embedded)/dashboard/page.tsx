'use client';

/**
 * app/(embedded)/dashboard/page.tsx
 *
 * Merchant dashboard — the primary landing page after app install.
 *
 * Shows:
 * - Shop name and domain
 * - Current subscription plan
 * - Sync health status (last run, products pushed, error count)
 * - Last sync status (success/partial/failed)
 * - Quick action to go to Plans if no subscription
 */

import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  SkeletonPage,
  SkeletonBodyText,
  Banner,
  Divider,
} from '@shopify/polaris';
import { useMerchantContext } from '@/hooks/useMerchantContext';
import { ApiError } from '@/lib/api/client';
import type { SyncStatus, LastSyncResult } from '@/types/merchant';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function syncStatusBadge(status: SyncStatus) {
  const map: Record<SyncStatus, { tone: 'success' | 'warning' | 'critical' | 'info'; label: string }> = {
    healthy: { tone: 'success', label: 'Healthy' },
    warning: { tone: 'warning', label: 'Warning' },
    error: { tone: 'critical', label: 'Error' },
    never_run: { tone: 'info', label: 'Never Run' },
  };
  const { tone, label } = map[status] ?? { tone: 'info', label: status };
  return <Badge tone={tone}>{label}</Badge>;
}

function lastSyncBadge(result: LastSyncResult) {
  if (!result) return <Badge tone="info">—</Badge>;
  const map: Record<NonNullable<LastSyncResult>, { tone: 'success' | 'warning' | 'critical'; label: string }> = {
    success: { tone: 'success', label: 'Success' },
    partial: { tone: 'warning', label: 'Partial' },
    failed: { tone: 'critical', label: 'Failed' },
  };
  const { tone, label } = map[result];
  return <Badge tone={tone}>{label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <SkeletonPage title="Dashboard" primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={3} />
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <SkeletonBodyText lines={4} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { shop, syncHealth, subscription, isLoading, isError, error, refetch } =
    useMerchantContext();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    const status = error instanceof ApiError ? error.status : null;
    const isAuthError = status === 401 || status === 403;
    // Show the actual message from the backend to aid debugging
    const backendMessage = error instanceof ApiError ? error.message : null;

    return (
      <Page title="Dashboard">
        <Banner
          title={isAuthError ? 'Session expired' : 'Failed to load dashboard'}
          tone="critical"
          action={
            isAuthError
              ? {
                  content: 'Reload page',
                  onAction: () => window.location.reload(),
                }
              : { content: 'Retry', onAction: refetch }
          }
        >
          <BlockStack gap="100">
            <p>
              {isAuthError
                ? 'Your session has expired or could not be verified. Reload the page to re-authenticate.'
                : 'Could not load your dashboard data. Please try again.'}
            </p>
            {backendMessage && backendMessage !== `Request failed: ${status}` && (
              <p><strong>Backend:</strong> {backendMessage}</p>
            )}
            {status && (
              <p><strong>Status:</strong> {status}</p>
            )}
          </BlockStack>
        </Banner>
      </Page>
    );
  }

  const hasNoSubscription = !subscription?.planId || subscription.status === 'cancelled';

  return (
    <Page
      title={shop?.name ?? 'Dashboard'}
      subtitle={shop?.domain}
    >
      <BlockStack gap="500">
        {/* Upsell banner for merchants without an active plan */}
        {hasNoSubscription && (
          <Banner
            title="No active plan"
            tone="warning"
            action={{ content: 'Choose a plan', url: '/plans' }}
          >
            <p>Select a plan to enable product syncing to AOA Traders.</p>
          </Banner>
        )}

        <Layout>
          {/* Store Info + Subscription */}
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Store Details
                  </Text>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Domain</Text>
                    <Text as="span" fontWeight="medium">{shop?.domain ?? '—'}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Email</Text>
                    <Text as="span" fontWeight="medium">{shop?.email ?? '—'}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Shopify plan</Text>
                    <Text as="span" fontWeight="medium">{shop?.shopifyPlan ?? '—'}</Text>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Subscription
                  </Text>
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Current plan</Text>
                    <Text as="span" fontWeight="medium">
                      {subscription?.planName ?? 'None'}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Status</Text>
                    <Badge
                      tone={
                        subscription?.status === 'active'
                          ? 'success'
                          : subscription?.status === 'pending'
                          ? 'warning'
                          : 'critical'
                      }
                    >
                      {subscription?.status ?? 'inactive'}
                    </Badge>
                  </InlineStack>
                  {subscription?.billingOn && (
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Next billing</Text>
                      <Text as="span">{formatDate(subscription.billingOn)}</Text>
                    </InlineStack>
                  )}
                  <Button url="/subscription" variant="plain">
                    Manage subscription
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Sync Health */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">
                    Sync Health
                  </Text>
                  {syncHealth && syncStatusBadge(syncHealth.status)}
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Last run</Text>
                  <Text as="span">{formatDate(syncHealth?.lastRun ?? null)}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Last status</Text>
                  {lastSyncBadge(syncHealth?.lastSyncStatus ?? null)}
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Products pushed</Text>
                  <Text as="span" fontWeight="medium">
                    {syncHealth?.productsPushed ?? 0}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Errors</Text>
                  <Text
                    as="span"
                    fontWeight="medium"
                    tone={
                      (syncHealth?.errorCount ?? 0) > 0 ? 'critical' : undefined
                    }
                  >
                    {syncHealth?.errorCount ?? 0}
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
