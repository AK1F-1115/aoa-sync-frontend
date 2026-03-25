'use client';

/**
 * app/(embedded)/dashboard/page.tsx
 *
 * Store overview — quick health summary and status banners.
 * Billing, sync details, markup, and collections are all managed in Settings.
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
import type { SyncStatus } from '@/types/merchant';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function syncStatusBadge(status: SyncStatus) {
  const map: Record<SyncStatus, { tone: 'success' | 'warning' | 'critical' | 'info'; label: string }> = {
    healthy:   { tone: 'success',  label: 'Healthy'      },
    warning:   { tone: 'warning',  label: 'Warning'      },
    error:     { tone: 'critical', label: 'Error'        },
    never_run: { tone: 'info',     label: 'Never Synced' },
  };
  const { tone, label } = map[status] ?? { tone: 'info', label: status };
  return <Badge tone={tone}>{label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { shop, syncHealth, subscription, isLoading, isError, error, refetch } =
    useMerchantContext();

  if (isLoading) {
    return (
      <SkeletonPage title="Dashboard" primaryAction>
        <Layout>
          <Layout.Section>
            <Card><SkeletonBodyText lines={3} /></Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card><SkeletonBodyText lines={4} /></Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  if (isError) {
    const status = error instanceof ApiError ? error.status : null;
    const isAuthError = status === 401 || status === 403;
    const backendMessage = error instanceof ApiError ? error.message : null;

    return (
      <Page title="Dashboard">
        <Banner
          title={isAuthError ? 'Session expired' : 'Failed to load dashboard'}
          tone="critical"
          action={
            isAuthError
              ? { content: 'Reload page', onAction: () => window.location.reload() }
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
            {status && <p><strong>Status:</strong> {status}</p>}
          </BlockStack>
        </Banner>
      </Page>
    );
  }

  const hasNoSubscription =
    !subscription?.planId ||
    subscription.planId === 'free' ||
    subscription.status === 'cancelled' ||
    subscription.status === 'free' ||
    subscription.status == null;

  const isOnTrial = subscription?.status === 'trial';
  const trialDaysRemaining = isOnTrial ? (subscription?.trialDaysRemaining ?? null) : null;

  return (
    <Page
      title={shop?.name ?? 'Dashboard'}
      subtitle={shop?.domain}
    >
      <BlockStack gap="500">
        {/* Trial banner */}
        {isOnTrial && (
          <Banner
            title={trialDaysRemaining !== null
              ? `Free trial — ${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} remaining`
              : 'Free trial active'}
            tone="info"
            action={{ content: 'Manage subscription', url: '/settings' }}
          >
            <p>Subscribe before your trial ends to keep your products synced.</p>
          </Banner>
        )}

        {/* No-plan upsell */}
        {hasNoSubscription && !isOnTrial && (
          <Banner
            title="No active plan"
            tone="warning"
            action={{ content: 'Choose a plan', url: '/settings' }}
          >
            <p>Select a plan to enable product syncing to AOA Traders.</p>
          </Banner>
        )}

        <Layout>
          {/* Store + subscription summary */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Store</Text>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Domain</Text>
                  <Text as="span" fontWeight="medium">{shop?.domain ?? '—'}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Plan</Text>
                  <Text as="span" fontWeight="medium">
                    {subscription?.planName ?? 'None'}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Subscription status</Text>
                  <Badge
                    tone={
                      subscription?.status === 'active'  ? 'success'  :
                      subscription?.status === 'trial'   ? 'info'     :
                      subscription?.status === 'pending' ? 'warning'  : 'critical'
                    }
                  >
                    {subscription?.status ?? 'inactive'}
                  </Badge>
                </InlineStack>
                <InlineStack>
                  <Button url="/settings" variant="plain">
                    Manage settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sync health summary */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Sync</Text>
                  {syncHealth && syncStatusBadge(syncHealth.status)}
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Last sync</Text>
                  <Text as="span">{formatDate(syncHealth?.lastRun ?? null)}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Products synced</Text>
                  <Text as="span" fontWeight="medium">
                    {(syncHealth?.productsPushed ?? 0).toLocaleString()}
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
