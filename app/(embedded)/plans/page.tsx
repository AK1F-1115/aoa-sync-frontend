'use client';

/**
 * app/(embedded)/plans/page.tsx
 *
 * Plans page — allows merchants to select and subscribe to a billing plan.
 *
 * Plans are fetched live from GET /billing/plans (public endpoint).
 * Falls back to STATIC_PLANS from lib/plans.ts if the request fails,
 * so the page is always functional.
 *
 * Flow:
 * 1. Fetches plans from GET /billing/plans
 * 2. Merchant selects a plan
 * 3. Merchant clicks "Subscribe" → POST /billing/subscribe { plan_slug }
 * 4. Backend returns confirmationUrl
 * 5. Frontend redirects to Shopify billing confirmation page
 * 6. After approval, Shopify → backend callback → /billing/return?status=success
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
  List,
  SkeletonPage,
  SkeletonBodyText,
  Divider,
  Modal,
} from '@shopify/polaris';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPlans, subscribeToPlan } from '@/lib/api/billing';
import { useMerchantContext } from '@/hooks/useMerchantContext';
import { STATIC_PLANS } from '@/lib/plans';
import { ApiError } from '@/lib/api/client';
import type { StaticPlan } from '@/lib/plans';

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

interface PlanCardProps {
  plan: StaticPlan;
  isCurrentPlan: boolean;
  onSelect: (slug: string) => void;
  isLoading: boolean;
}

function PlanCard({ plan, isCurrentPlan, onSelect, isLoading }: PlanCardProps) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h3">
            {plan.name}
          </Text>
          {plan.isPopular && <Badge tone="info">Most popular</Badge>}
          {isCurrentPlan && <Badge tone="success">Current plan</Badge>}
        </InlineStack>

        <Text variant="heading2xl" as="p">
          ${plan.price}
          <Text as="span" tone="subdued" variant="bodyMd">
            {' '}
            / month
          </Text>
        </Text>

        {plan.trialDays && plan.trialDays > 0 && (
          <Banner tone="info">
            <Text as="span">{plan.trialDays}-day free trial included</Text>
          </Banner>
        )}

        <Divider />

        <List>
          {plan.features.map((feature) => (
            <List.Item key={feature}>{feature}</List.Item>
          ))}
        </List>

        <Button
          variant={isCurrentPlan ? 'plain' : 'primary'}
          disabled={isCurrentPlan || isLoading}
          loading={isLoading}
          onClick={() => onSelect(plan.slug)}
          fullWidth
        >
          {isCurrentPlan ? 'Current plan' : `Subscribe to ${plan.name}`}
        </Button>
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PlansPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Current plan slug from the already-loaded merchant context (no extra fetch)
  const { subscription } = useMerchantContext();
  const currentPlanSlug = subscription?.planId ?? null;

  // Fetch live plans from backend; fall back to STATIC_PLANS on error
  const { data: apiPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
    staleTime: 10 * 60_000,
    // Don't retry on error — fall back to static plans immediately
    retry: false,
  });
  const plans: StaticPlan[] = apiPlans ?? STATIC_PLANS;

  const subscribeMutation = useMutation({
    mutationFn: (slug: string) => subscribeToPlan(slug),
    onSuccess: (data: { confirmationUrl: string }) => {
      // Redirect to Shopify's billing confirmation page
      // This takes the merchant outside the app temporarily
      if (window.top) {
        window.top.location.assign(data.confirmationUrl);
      } else {
        window.location.assign(data.confirmationUrl);
      }
    },
    onError: (error: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Plans] Subscribe failed:', error);
      }
    },
  });

  const handlePlanSelect = (slug: string): void => {
    setSelectedSlug(slug);
    setConfirmModalOpen(true);
  };

  const handleConfirmSubscribe = (): void => {
    if (!selectedSlug) return;
    subscribeMutation.mutate(selectedSlug);
    setConfirmModalOpen(false);
  };

  const selectedPlan = plans.find((p) => p.slug === selectedSlug);

  if (plansLoading) {
    return (
      <SkeletonPage title="Plans">
        <Layout>
          {[1, 2, 3].map((i) => (
            <Layout.Section variant="oneThird" key={i}>
              <Card>
                <SkeletonBodyText lines={7} />
              </Card>
            </Layout.Section>
          ))}
        </Layout>
      </SkeletonPage>
    );
  }

  return (
    <Page
      title="Plans"
      subtitle="Choose the plan that fits your business"
    >
      <BlockStack gap="500">
        {subscribeMutation.isError && (
          <Banner title="Subscription failed" tone="critical">
            <Text as="p">
              {subscribeMutation.error instanceof ApiError
                ? subscribeMutation.error.message
                : 'An unexpected error occurred. Please try again.'}
            </Text>
          </Banner>
        )}

        <Layout>
          {plans.map((plan: StaticPlan) => (
            <Layout.Section variant="oneThird" key={plan.slug}>
              <PlanCard
                plan={plan}
                isCurrentPlan={plan.slug === currentPlanSlug}
                onSelect={handlePlanSelect}
                isLoading={
                  subscribeMutation.isPending && selectedSlug === plan.slug
                }
              />
            </Layout.Section>
          ))}
        </Layout>

        {/* Confirmation modal */}
        {selectedPlan && (
          <Modal
            open={confirmModalOpen}
            onClose={() => setConfirmModalOpen(false)}
            title="Confirm subscription"
            primaryAction={{
              content: 'Confirm',
              onAction: handleConfirmSubscribe,
              loading: subscribeMutation.isPending,
            }}
            secondaryActions={[
              {
                content: 'Cancel',
                onAction: () => setConfirmModalOpen(false),
              },
            ]}
          >
            <Modal.Section>
              <Text as="p">
                You&apos;re about to subscribe to the{' '}
                <strong>{selectedPlan.name}</strong> plan. You&apos;ll be taken
                to Shopify to confirm your billing details.
              </Text>
            </Modal.Section>
          </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
