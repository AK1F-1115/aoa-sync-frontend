'use client';

/**
 * app/(embedded)/plans/page.tsx
 *
 * Plans page — allows merchants to select and subscribe to a billing plan.
 *
 * Flow:
 * 1. Loads available plans from backend (GET /billing/plans)
 * 2. Merchant selects a plan
 * 3. Merchant clicks "Subscribe" → POST /billing/subscribe
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
import { ApiError } from '@/lib/api/client';
import type { Plan, BillingPlanId } from '@/types/api';

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

interface PlanCardProps {
  plan: Plan;
  isCurrentPlan: boolean;
  onSelect: (planId: BillingPlanId) => void;
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
          onClick={() => onSelect(plan.id)}
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
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const {
    data: plans,
    isLoading: plansLoading,
    isError: plansError,
  } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
    staleTime: 5 * 60_000,
  });

  const subscribeMutation = useMutation({
    mutationFn: (planId: BillingPlanId) => subscribeToPlan(planId),
    onSuccess: (data: { confirmationUrl: string }) => {
      // Redirect to Shopify's billing confirmation page
      // This takes the merchant outside the app temporarily
      window.top?.location.assign(data.confirmationUrl) ??
        window.location.assign(data.confirmationUrl);
    },
    onError: (error: unknown) => {
      // Error is displayed via subscribeMutation.error
      if (process.env.NODE_ENV === 'development') {
        console.error('[Plans] Subscribe failed:', error);
      }
    },
  });

  const handlePlanSelect = (planId: BillingPlanId): void => {
    setSelectedPlan(planId);
    setConfirmModalOpen(true);
  };

  const handleConfirmSubscribe = (): void => {
    if (!selectedPlan) return;
    subscribeMutation.mutate(selectedPlan);
    setConfirmModalOpen(false);
  };

  if (plansLoading) {
    return (
      <SkeletonPage title="Plans">
        <Layout>
          {[1, 2, 3].map((i) => (
            <Layout.Section variant="oneThird" key={i}>
              <Card>
                <SkeletonBodyText lines={6} />
              </Card>
            </Layout.Section>
          ))}
        </Layout>
      </SkeletonPage>
    );
  }

  if (plansError) {
    return (
      <Page title="Plans">
        <Banner title="Could not load plans" tone="critical">
          <Text as="p">Please reload the page to try again.</Text>
        </Banner>
      </Page>
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
          {(plans ?? []).map((plan: Plan) => (
            <Layout.Section variant="oneThird" key={plan.id}>
              <PlanCard
                plan={plan}
                isCurrentPlan={false} // TODO: compare with current subscription
                onSelect={handlePlanSelect}
                isLoading={
                  subscribeMutation.isPending && selectedPlan === plan.id
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
                <strong>
                  {plans?.find((p: Plan) => p.id === selectedPlan)?.name}
                </strong>{' '}
                plan. You&apos;ll be taken to Shopify to confirm your billing details.
              </Text>
            </Modal.Section>
          </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
