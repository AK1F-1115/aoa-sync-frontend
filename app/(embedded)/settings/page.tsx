'use client';

/**
 * app/(embedded)/settings/page.tsx
 *
 * Settings hub — 4 tabs:
 *   Billing      → current plan status, plan cards, subscribe/change plan, cancel
 *   Sync Health  → last sync time, products synced, result status
 *   Markup       → retail / VDS / wholesale markup % editor
 *   Collections  → smart collection bootstrap (Starter+ only)
 */

import { useState, useEffect } from 'react';
import {
  Page,
  Tabs,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  TextField,
  SkeletonPage,
  SkeletonBodyText,
  Divider,
  Badge,
  Modal,
  List,
  Box,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlans, subscribeToPlan, cancelSubscription } from '@/lib/api/billing';
import { getSettings, updateSettings } from '@/lib/api/settings';
import { getCollections, bootstrapCollections } from '@/lib/api/collections';
import { useMerchantContext } from '@/hooks/useMerchantContext';
import { STATIC_PLANS } from '@/lib/plans';
import { ApiError } from '@/lib/api/client';
import type { StaticPlan } from '@/lib/plans';
import type { SyncHealth } from '@/types/merchant';
import type { SubscriptionInfo } from '@/types/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'billing',     content: 'Billing'      },
  { id: 'sync',        content: 'Sync Health'  },
  { id: 'markup',      content: 'Markup'       },
  { id: 'collections', content: 'Collections'  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

/** Convert decimal ratio to display percentage string  e.g. 0.25 → "25" */
function toPercent(ratio: number): string {
  return (ratio * 100).toFixed(0);
}

/** Parse percentage input string to decimal ratio  e.g. "25" → 0.25 */
function fromPercent(pct: string): number {
  return parseFloat(pct) / 100;
}

function isValidPercent(val: string): boolean {
  const n = parseFloat(val);
  return !isNaN(n) && n >= 0 && n <= 1000;
}

// ---------------------------------------------------------------------------
// Plan Card
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  isCurrentPlan,
  onSelect,
  isLoading,
}: {
  plan: StaticPlan;
  isCurrentPlan: boolean;
  onSelect: (slug: string) => void;
  isLoading: boolean;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h3">{plan.name}</Text>
          <InlineStack gap="200">
            {plan.isPopular && <Badge tone="info">Popular</Badge>}
            {isCurrentPlan && <Badge tone="success">Current</Badge>}
          </InlineStack>
        </InlineStack>

        <Text variant="heading2xl" as="p">
          {plan.price === 0 ? 'Free' : `$${plan.price}`}
          {plan.price > 0 && (
            <Text as="span" tone="subdued" variant="bodyMd">{' '}/ mo</Text>
          )}
        </Text>

        {plan.trialDays !== undefined && plan.trialDays > 0 && (
          <Text as="p" tone="subdued" variant="bodySm">
            {plan.trialDays}-day free trial included
          </Text>
        )}

        <Divider />

        <List>
          {plan.features.map((f) => (
            <List.Item key={f}>{f}</List.Item>
          ))}
        </List>

        <Button
          variant={isCurrentPlan ? 'plain' : 'primary'}
          disabled={isCurrentPlan || isLoading}
          loading={isLoading}
          onClick={() => onSelect(plan.slug)}
          fullWidth
        >
          {isCurrentPlan
            ? 'Current plan'
            : plan.price === 0
            ? 'Switch to Free'
            : 'Subscribe'}
        </Button>
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Billing Tab
// ---------------------------------------------------------------------------

function BillingTab({ subscription }: { subscription: SubscriptionInfo | undefined }) {
  const queryClient = useQueryClient();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: apiPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: getPlans,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const plans: StaticPlan[] = apiPlans ?? STATIC_PLANS;

  const subscribeMutation = useMutation({
    mutationFn: (slug: string) => subscribeToPlan(slug),
    onSuccess: (data) => {
      const url = data.confirmation_url;
      if (window.top) window.top.location.assign(url);
      else window.location.assign(url);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['merchantContext'] });
      setCancelOpen(false);
    },
  });

  const canCancel =
    subscription?.status === 'active' || subscription?.status === 'trial';
  const selectedPlan = plans.find((p) => p.slug === selectedSlug);

  const statusTone =
    subscription?.status === 'active'  ? ('success'  as const) :
    subscription?.status === 'trial'   ? ('info'     as const) :
    subscription?.status === 'pending' ? ('warning'  as const) :
                                         ('critical' as const);

  return (
    <BlockStack gap="500">
      {/* Current plan summary */}
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Current Plan</Text>
          <Divider />
          <InlineStack align="space-between">
            <Text as="span" tone="subdued">Plan</Text>
            <Text as="span" fontWeight="medium">{subscription?.planName ?? 'None'}</Text>
          </InlineStack>
          <InlineStack align="space-between">
            <Text as="span" tone="subdued">Status</Text>
            <Badge tone={statusTone}>{subscription?.status ?? 'inactive'}</Badge>
          </InlineStack>
          {subscription?.status === 'trial' && subscription.trialDaysRemaining != null && (
            <InlineStack align="space-between">
              <Text as="span" tone="subdued">Trial days remaining</Text>
              <Text as="span" fontWeight="medium">
                {subscription.trialDaysRemaining}{' '}
                day{subscription.trialDaysRemaining !== 1 ? 's' : ''}
              </Text>
            </InlineStack>
          )}
          {subscription?.billingOn && (
            <InlineStack align="space-between">
              <Text as="span" tone="subdued">
                {subscription.status === 'trial' ? 'Trial ends' : 'Next billing'}
              </Text>
              <Text as="span">{formatDate(subscription.billingOn)}</Text>
            </InlineStack>
          )}
        </BlockStack>
      </Card>

      {/* Errors / success banners */}
      {subscribeMutation.isError && (
        <Banner title="Subscription failed" tone="critical">
          <Text as="p">
            {subscribeMutation.error instanceof ApiError
              ? subscribeMutation.error.message
              : 'An unexpected error occurred. Please try again.'}
          </Text>
        </Banner>
      )}
      {cancelMutation.isSuccess && (
        <Banner title="Subscription cancelled" tone="success">
          <Text as="p">
            {cancelMutation.data?.message ?? 'Your subscription has been cancelled.'}
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

      {/* Plan cards */}
      <Text variant="headingMd" as="h2">Available Plans</Text>
      {plansLoading ? (
        <Layout>
          {[1, 2, 3, 4].map((i) => (
            <Layout.Section variant="oneThird" key={i}>
              <Card><SkeletonBodyText lines={6} /></Card>
            </Layout.Section>
          ))}
        </Layout>
      ) : (
        <Layout>
          {plans.map((plan) => (
            <Layout.Section variant="oneThird" key={plan.slug}>
              <PlanCard
                plan={plan}
                isCurrentPlan={plan.slug === (subscription?.planId ?? null)}
                onSelect={(slug) => { setSelectedSlug(slug); setConfirmOpen(true); }}
                isLoading={subscribeMutation.isPending && selectedSlug === plan.slug}
              />
            </Layout.Section>
          ))}
        </Layout>
      )}

      {/* Cancel section */}
      {canCancel && !cancelMutation.isSuccess && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h3">Cancel Subscription</Text>
            <Text as="p" tone="subdued">
              Cancelling stops future billing. Your products will remain on AOA
              Traders for 3 days, then are removed automatically.
            </Text>
            <InlineStack>
              <Button
                tone="critical"
                variant="plain"
                onClick={() => setCancelOpen(true)}
                loading={cancelMutation.isPending}
              >
                Cancel subscription
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      )}

      {/* Subscribe confirmation modal */}
      {selectedPlan && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Confirm subscription"
          primaryAction={{
            content: 'Confirm',
            loading: subscribeMutation.isPending,
            onAction: () => {
              if (selectedSlug) subscribeMutation.mutate(selectedSlug);
              setConfirmOpen(false);
            },
          }}
          secondaryActions={[
            { content: 'Cancel', onAction: () => setConfirmOpen(false) },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              You&apos;re about to subscribe to{' '}
              <strong>{selectedPlan.name}</strong>. You&apos;ll be taken to
              Shopify to confirm your billing details.
            </Text>
          </Modal.Section>
        </Modal>
      )}

      {/* Cancel confirmation modal */}
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel subscription?"
        primaryAction={{
          content: 'Yes, cancel',
          destructive: true,
          loading: cancelMutation.isPending,
          onAction: () => cancelMutation.mutate(),
        }}
        secondaryActions={[
          { content: 'Keep subscription', onAction: () => setCancelOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure? Your products will remain active on AOA Traders for
            3 days after cancellation, then be removed automatically.
          </Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// Sync Health Tab
// ---------------------------------------------------------------------------

function SyncHealthTab({ syncHealth }: { syncHealth: SyncHealth | undefined }) {
  const statusConfig = {
    healthy:   { tone: 'success'  as const, label: 'Healthy'      },
    warning:   { tone: 'warning'  as const, label: 'Warning'      },
    error:     { tone: 'critical' as const, label: 'Error'        },
    never_run: { tone: 'info'     as const, label: 'Never synced' },
  };
  const lastSyncConfig = {
    success: { tone: 'success'  as const, label: 'Success' },
    partial: { tone: 'warning'  as const, label: 'Partial' },
    failed:  { tone: 'critical' as const, label: 'Failed'  },
  };

  const status = syncHealth?.status ?? 'never_run';
  const { tone, label } = statusConfig[status];
  const lastSyncStatus = syncHealth?.lastSyncStatus ?? null;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h2">Sync Health</Text>
          <Badge tone={tone}>{label}</Badge>
        </InlineStack>
        <Divider />
        <InlineStack align="space-between">
          <Text as="span" tone="subdued">Last sync</Text>
          <Text as="span">{formatDate(syncHealth?.lastRun ?? null)}</Text>
        </InlineStack>
        <InlineStack align="space-between">
          <Text as="span" tone="subdued">Last result</Text>
          {lastSyncStatus
            ? <Badge tone={lastSyncConfig[lastSyncStatus].tone}>
                {lastSyncConfig[lastSyncStatus].label}
              </Badge>
            : <Badge tone="info">—</Badge>
          }
        </InlineStack>
        <InlineStack align="space-between">
          <Text as="span" tone="subdued">Products synced</Text>
          <Text as="span" fontWeight="medium">
            {(syncHealth?.productsPushed ?? 0).toLocaleString()}
          </Text>
        </InlineStack>
        <InlineStack align="space-between">
          <Text as="span" tone="subdued">Errors in last sync</Text>
          <Text
            as="span"
            fontWeight="medium"
            tone={(syncHealth?.errorCount ?? 0) > 0 ? 'critical' : undefined}
          >
            {syncHealth?.errorCount ?? 0}
          </Text>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Markup Tab
// ---------------------------------------------------------------------------

function MarkupTab() {
  const queryClient = useQueryClient();
  const [retailPct, setRetailPct] = useState('');
  const [vdsPct, setVdsPct] = useState('');
  const [wholesalePct, setWholesalePct] = useState('');
  const [formDirty, setFormDirty] = useState(false);

  const {
    data: settings,
    isLoading,
    isError,
    error: settingsErr,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  });

  // Populate form once data loads — don't overwrite while user is editing
  useEffect(() => {
    if (settings && !formDirty) {
      setRetailPct(toPercent(settings.markup_pct_retail));
      setVdsPct(toPercent(settings.markup_pct_vds));
      setWholesalePct(toPercent(settings.markup_pct_wholesale));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      setFormDirty(false);
    },
  });

  if (isLoading) return <Card><SkeletonBodyText lines={6} /></Card>;
  if (isError) {
    return (
      <Banner title="Could not load markup settings" tone="critical">
        <Text as="p">
          {settingsErr instanceof ApiError
            ? settingsErr.message
            : 'Please reload the page.'}
        </Text>
      </Banner>
    );
  }

  const priceSyncQueued =
    updateMutation.isSuccess && updateMutation.data?.price_sync === 'queued';
  const noChange =
    updateMutation.isSuccess && updateMutation.data?.price_sync === 'not_needed';

  return (
    <BlockStack gap="400">
      {priceSyncQueued && (
        <Banner title="Prices are updating" tone="success">
          <Text as="p">
            Your store will reflect the new markup within ~10 minutes.
            {(updateMutation.data!.products_affected ?? 0) > 0
              ? ` ${updateMutation.data!.products_affected.toLocaleString()} products affected.`
              : ''}
          </Text>
        </Banner>
      )}
      {noChange && (
        <Banner title="No changes" tone="info">
          <Text as="p">
            The values submitted match your current markup — nothing was updated.
          </Text>
        </Banner>
      )}
      {updateMutation.isError && (
        <Banner title="Could not save markup" tone="critical">
          <Text as="p">
            {updateMutation.error instanceof ApiError
              ? updateMutation.error.message
              : 'An unexpected error occurred. Please try again.'}
          </Text>
        </Banner>
      )}

      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Markup Pricing</Text>
          <Text as="p" tone="subdued">
            Markup applied on top of AOA&apos;s cost price when syncing products to
            your store. Enter values as percentages (e.g. 25 = 25%). Changes
            trigger a background price update (~10 minutes).
          </Text>
          <Divider />
          <InlineStack gap="400">
            <TextField
              label="Retail (%)"
              type="number"
              value={retailPct}
              onChange={(v) => { setRetailPct(v); setFormDirty(true); }}
              suffix="%"
              min={0}
              max={1000}
              autoComplete="off"
              error={retailPct !== '' && !isValidPercent(retailPct)
                ? 'Enter a value between 0 and 1000' : undefined}
            />
            <TextField
              label="VDS (%)"
              type="number"
              value={vdsPct}
              onChange={(v) => { setVdsPct(v); setFormDirty(true); }}
              suffix="%"
              min={0}
              max={1000}
              autoComplete="off"
              error={vdsPct !== '' && !isValidPercent(vdsPct)
                ? 'Enter a value between 0 and 1000' : undefined}
            />
            <TextField
              label="Wholesale (%)"
              type="number"
              value={wholesalePct}
              onChange={(v) => { setWholesalePct(v); setFormDirty(true); }}
              suffix="%"
              min={0}
              max={1000}
              autoComplete="off"
              error={wholesalePct !== '' && !isValidPercent(wholesalePct)
                ? 'Enter a value between 0 and 1000' : undefined}
            />
          </InlineStack>
          <InlineStack>
            <Button
              variant="primary"
              onClick={() =>
                updateMutation.mutate({
                  markup_pct_retail: fromPercent(retailPct),
                  markup_pct_vds: fromPercent(vdsPct),
                  markup_pct_wholesale: fromPercent(wholesalePct),
                })
              }
              loading={updateMutation.isPending}
              disabled={!formDirty || updateMutation.isPending}
            >
              Save markup
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// Collections Tab
// ---------------------------------------------------------------------------

function CollectionsTab({ isFreePlan }: { isFreePlan: boolean }) {
  const queryClient = useQueryClient();

  const { data: collections, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
    staleTime: 60_000,
    enabled: !isFreePlan,
  });

  const bootstrapMutation = useMutation({
    mutationFn: bootstrapCollections,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h2">Smart Collections</Text>
          {!isFreePlan && !isLoading && collections && (
            <Badge tone={collections.collections_bootstrapped ? 'success' : 'info'}>
              {collections.collections_bootstrapped
                ? `${collections.total} collections`
                : 'Not set up'}
            </Badge>
          )}
        </InlineStack>
        <Divider />
        <Text as="p" tone="subdued">
          Automatically create one Shopify smart collection per product category
          (e.g. &ldquo;Office Supplies&rdquo;, &ldquo;Furniture&rdquo;). Products are assigned by
          Shopify&apos;s rules engine.
        </Text>

        {isFreePlan ? (
          <Banner tone="warning">
            <Text as="p">
              Smart collections are available on the Starter plan and above.
              Switch to the <strong>Billing</strong> tab to upgrade your plan.
            </Text>
          </Banner>
        ) : (
          <BlockStack gap="400">
            {!isLoading && collections && (
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Category collections</Text>
                  <Text as="span" fontWeight="medium">
                    {collections.category_collections}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Brand collections</Text>
                  <Text as="span" fontWeight="medium">
                    {collections.brand_collections}
                  </Text>
                </InlineStack>
              </BlockStack>
            )}

            {bootstrapMutation.isSuccess && (
              <Banner title="Collections created" tone="success">
                <Text as="p">
                  {bootstrapMutation.data.total} collections have been set up
                  in your Shopify store.
                </Text>
              </Banner>
            )}
            {bootstrapMutation.isError && (
              <Banner title="Setup failed" tone="critical">
                <Text as="p">
                  {bootstrapMutation.error instanceof ApiError
                    ? bootstrapMutation.error.message
                    : 'An unexpected error occurred. Please try again.'}
                </Text>
              </Banner>
            )}

            <InlineStack>
              <Button
                variant="primary"
                onClick={() => bootstrapMutation.mutate()}
                loading={bootstrapMutation.isPending}
                disabled={bootstrapMutation.isPending}
              >
                {collections?.collections_bootstrapped
                  ? 'Rebuild collections'
                  : 'Set up collections'}
              </Button>
            </InlineStack>

            {bootstrapMutation.isPending && (
              <Text as="p" tone="subdued">
                Setting up collections — this can take 30–120 seconds for large
                catalogs. Please wait…
              </Text>
            )}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [selectedTab, setSelectedTab] = useState(0);
  const {
    syncHealth,
    subscription,
    isLoading,
    isError,
    error,
    refetch,
  } = useMerchantContext();

  const isFreePlan =
    !subscription?.planId || subscription.planId === 'free';

  if (isLoading) {
    return (
      <SkeletonPage title="Settings">
        <Layout>
          <Layout.Section>
            <Card><SkeletonBodyText lines={5} /></Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  if (isError) {
    return (
      <Page title="Settings">
        <Banner
          title="Could not load settings"
          tone="critical"
          action={{ content: 'Retry', onAction: refetch }}
        >
          <Text as="p">
            {error instanceof ApiError
              ? error.message
              : 'Please reload the page.'}
          </Text>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Settings"
      subtitle="Billing, sync health, markup, and collections"
    >
      <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="500">
          {selectedTab === 0 && <BillingTab subscription={subscription} />}
          {selectedTab === 1 && <SyncHealthTab syncHealth={syncHealth} />}
          {selectedTab === 2 && <MarkupTab />}
          {selectedTab === 3 && <CollectionsTab isFreePlan={isFreePlan} />}
        </Box>
      </Tabs>
    </Page>
  );
}
