'use client';

/**
 * app/(embedded)/subscription/page.tsx
 *
 * Subscription management page.
 *
 * Shows:
 * - Current plan name and status
 * - Billing date
 * - Upgrade/downgrade action (links to Plans page)
 * - Cancel subscription action (with confirmation)
 */

import { useState } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  SkeletonPage,
  SkeletonBodyText,
  Divider,
  Modal,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubscription } from '@/lib/api/subscription';
import { cancelSubscription } from '@/lib/api/billing';
import { ApiError } from '@/lib/api/client';
import type { SubscriptionStatus } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: SubscriptionStatus) {
  const map: Record<
    SubscriptionStatus,
    { tone: 'success' | 'warning' | 'critical' | 'info'; label: string }
  > = {
    active: { tone: 'success', label: 'Active' },
    pending: { tone: 'warning', label: 'Pending approval' },
    cancelled: { tone: 'critical', label: 'Cancelled' },
    frozen: { tone: 'warning', label: 'Frozen' },
    expired: { tone: 'critical', label: 'Expired' },
  };
  const { tone, label } = map[status] ?? { tone: 'info', label: status };
  return <Badge tone={tone}>{label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SubscriptionPage() {
  const queryClient = useQueryClient();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const {
    data: subscription,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['subscription'],
    queryFn: getSubscription,
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      // Invalidate both subscription and merchantContext queries
      void queryClient.invalidateQueries({ queryKey: ['subscription'] });
      void queryClient.invalidateQueries({ queryKey: ['merchantContext'] });
      setCancelModalOpen(false);
    },
  });

  const isActive = subscription?.status === 'active';
  const isPending = subscription?.status === 'pending';
  const isCancelled =
    subscription?.status === 'cancelled' || subscription?.status === 'expired';

  if (isLoading) {
    return (
      <SkeletonPage title="Subscription">
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonBodyText lines={5} />
            </Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  if (isError) {
    return (
      <Page title="Subscription">
        <Banner title="Could not load subscription" tone="critical">
          <Text as="p">
            {error instanceof ApiError
              ? error.message
              : 'An unexpected error occurred. Please reload the page.'}
          </Text>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Subscription"
      subtitle="Manage your AOA Sync plan"
      primaryAction={
        isCancelled || !subscription?.planId
          ? { content: 'Choose a plan', url: '/plans' }
          : undefined
      }
    >
      <BlockStack gap="500">
        {/* Status banners */}
        {isPending && (
          <Banner title="Subscription pending" tone="warning">
            <Text as="p">
              Your subscription is awaiting billing approval from Shopify. This
              may take a few minutes.
            </Text>
          </Banner>
        )}

        {isCancelled && (
          <Banner title="No active subscription" tone="info">
            <Text as="p">
              You don&apos;t have an active subscription. Choose a plan to resume
              syncing products to AOA Traders.
            </Text>
          </Banner>
        )}

        {cancelMutation.isSuccess && (
          <Banner title="Subscription cancelled" tone="success">
            <Text as="p">
              Your subscription has been cancelled. You can resubscribe at any
              time from the Plans page.
            </Text>
          </Banner>
        )}

        {cancelMutation.isError && (
          <Banner title="Could not cancel subscription" tone="critical">
            <Text as="p">
              {cancelMutation.error instanceof ApiError
                ? cancelMutation.error.message
                : 'An unexpected error occurred. Please try again.'}
            </Text>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Current Plan
                </Text>
                <Divider />

                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">
                    Plan
                  </Text>
                  <Text as="span" fontWeight="medium">
                    {subscription?.planName ?? 'None'}
                  </Text>
                </InlineStack>

                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">
                    Status
                  </Text>
                  {subscription?.status ? statusBadge(subscription.status) : <Badge tone="info">—</Badge>}
                </InlineStack>

                {subscription?.billingOn && (
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Next billing date
                    </Text>
                    <Text as="span">{formatDate(subscription.billingOn)}</Text>
                  </InlineStack>
                )}

                {subscription?.trialDaysRemaining !== null &&
                  subscription?.trialDaysRemaining !== undefined &&
                  subscription.trialDaysRemaining > 0 && (
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">
                        Trial days remaining
                      </Text>
                      <Text as="span" fontWeight="medium">
                        {subscription.trialDaysRemaining} days
                      </Text>
                    </InlineStack>
                  )}

                <Divider />

                <InlineStack gap="300">
                  <Button url="/plans" variant="primary">
                    {isActive ? 'Change plan' : 'Choose a plan'}
                  </Button>

                  {isActive && (
                    <Button
                      tone="critical"
                      variant="plain"
                      onClick={() => setCancelModalOpen(true)}
                      loading={cancelMutation.isPending}
                    >
                      Cancel subscription
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Cancel confirmation modal */}
        <Modal
          open={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          title="Cancel subscription?"
          primaryAction={{
            content: 'Yes, cancel',
            onAction: () => cancelMutation.mutate(),
            loading: cancelMutation.isPending,
            destructive: true,
          }}
          secondaryActions={[
            {
              content: 'Keep subscription',
              onAction: () => setCancelModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to cancel your{' '}
              <strong>{subscription?.planName}</strong> plan? Product syncing
              will stop at the end of the current billing period.
            </Text>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}
