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
  Checkbox,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlans, subscribeToPlan, cancelSubscription } from '@/lib/api/billing';
import { getSettings, updateSettings } from '@/lib/api/settings';
import { getCollections, bootstrapCollections } from '@/lib/api/collections';
import { getShipping, bootstrapShipping } from '@/lib/api/shipping';
import { useMerchantContext } from '@/hooks/useMerchantContext';
import { STATIC_PLANS } from '@/lib/plans';
import { ApiError } from '@/lib/api/client';
import type { StaticPlan } from '@/lib/plans';
import type { SyncHealth } from '@/types/merchant';
import type { SubscriptionInfo, ShippingState } from '@/types/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'billing',     content: 'Billing'      },
  { id: 'sync',        content: 'Sync Health'  },
  { id: 'markup',      content: 'Markup'       },
  { id: 'collections', content: 'Collections'  },
  { id: 'shipping',    content: 'Shipping'     },
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

function BillingTab({
  subscription,
  shopDomain,
}: {
  subscription: SubscriptionInfo | undefined;
  shopDomain: string | undefined;
}) {
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
    mutationFn: (planId: number) => subscribeToPlan(planId),
    onSuccess: (data) => {
      if (data.confirmation_url) {
        // Paid plan — redirect to Shopify billing approval page.
        // Must use window.open(_top) or window.location — NOT window.top.location.
        // In the Shopify Admin iframe, window.top is cross-origin, so accessing
        // window.top.location throws a SecurityError which React Query treats as
        // a mutation failure even though the backend call succeeded.
        window.open(data.confirmation_url, '_top');
      } else if (data.activated) {
        // Free plan — already active, no Shopify redirect needed
        void queryClient.invalidateQueries({ queryKey: ['merchantContext'] });
        const target = shopDomain
          ? `/dashboard?shop=${shopDomain}`
          : '/dashboard';
        window.open(target, '_top');
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['merchantContext'] });
      setCancelOpen(false);
    },
  });

  // Backend always writes status='active' after confirm — 'trial' is never returned
  const canCancel    = subscription?.status === 'active';
  const selectedPlan = plans.find((p) => p.slug === selectedSlug);
  const currentPlan  = plans.find((p) => p.slug === (subscription?.planId ?? null));

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
          {currentPlan?.trialDays != null && currentPlan.trialDays > 0 && (
            <InlineStack align="space-between">
              <Text as="span" tone="subdued">Free trial</Text>
              <Text as="span" fontWeight="medium">
                {currentPlan.trialDays} day{currentPlan.trialDays !== 1 ? 's' : ''} included
              </Text>
            </InlineStack>
          )}
          {subscription?.billingOn && (
            <InlineStack align="space-between">
              <Text as="span" tone="subdued">Next billing</Text>
              <Text as="span">{formatDate(subscription.billingOn)}</Text>
            </InlineStack>
          )}
        </BlockStack>
      </Card>

      {/* Pending approval banner — shown when a charge was created but merchant
          hasn't approved it yet in Shopify. This can happen if the billing
          redirect didn't fire or they navigated away before clicking Approve.
          Re-calls subscribe to get a fresh confirmation_url from the backend. */}
      {subscription?.status === 'pending' && !subscribeMutation.isPending && (
        <Banner
          title="Approval required to activate your plan"
          tone="warning"
          action={{
            content: 'Go to approval page',
            loading: subscribeMutation.isPending,
            onAction: () => {
              const plan = plans.find((p) => p.slug === (subscription?.planId ?? null));
              if (plan) subscribeMutation.mutate(plan.id);
            },
          }}
        >
          <Text as="p">
            Your <strong>{subscription.planName}</strong> plan is waiting for
            billing approval in Shopify. Click below to complete the approval —
            you won&apos;t be charged twice.
          </Text>
        </Banner>
      )}

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
              if (selectedSlug) {
                const plan = plans.find((p) => p.slug === selectedSlug);
                if (plan) subscribeMutation.mutate(plan.id);
              }
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

      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Auto-fill Products</Text>
          <Text as="p" tone="subdued">
            Automatically fill your plan&apos;s product slots from the AOA catalog
            on each sync run. Products are added up to your plan limit.
          </Text>
          <Divider />
          <Checkbox
            label="Auto-fill warehouse products"
            helpText="Automatically add retail / warehouse products up to your plan limit on each sync."
            checked={settings?.push_retail ?? false}
            onChange={(checked) =>
              updateMutation.mutate({ push_retail: checked })
            }
            disabled={updateMutation.isPending}
          />
          <Checkbox
            label="Auto-fill dropship products"
            helpText="Automatically add VDS dropship products up to your plan limit on each sync."
            checked={settings?.push_vds ?? false}
            onChange={(checked) =>
              updateMutation.mutate({ push_vds: checked })
            }
            disabled={updateMutation.isPending}
          />
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
// Shipping Tab
// ---------------------------------------------------------------------------

function ShippingTab({ shopDomain }: { shopDomain: string | undefined }) {
  const queryClient = useQueryClient();

  // 503 scope-missing error is stored separately — React Query swallows it
  // after retry; we want to persist the message for the user.
  const [scopeError, setScopeError] = useState<string | null>(null);

  const {
    data: shipping,
    isLoading,
    isError: shippingLoadError,
    error: shippingErr,
    refetch: refetchShipping,
  } = useQuery({
    queryKey: ['shipping'],
    queryFn: getShipping,
    staleTime: 60_000,
  });

  const toggleAutoMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateSettings({ auto_shipping_profiles: enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['shipping'] });
      setScopeError(null);
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: bootstrapShipping,
    onSuccess: (data) => {
      if (!data.skipped) {
        void queryClient.invalidateQueries({ queryKey: ['shipping'] });
      }
      setScopeError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 503) {
        setScopeError(err.message);
        // Backend disabled auto_shipping_profiles — refetch settings + shipping
        void queryClient.invalidateQueries({ queryKey: ['settings'] });
        void queryClient.invalidateQueries({ queryKey: ['shipping'] });
      }
    },
  });

  const adminShippingUrl = shopDomain
    ? `https://${shopDomain}/admin/settings/shipping`
    : null;

  if (isLoading) return <Card><SkeletonBodyText lines={6} /></Card>;

  if (shippingLoadError) {
    return (
      <Banner title="Could not load shipping status" tone="critical"
        action={{ content: 'Retry', onAction: refetchShipping }}>
        <Text as="p">
          {shippingErr instanceof ApiError
            ? shippingErr.message
            : 'An unexpected error occurred.'}
        </Text>
      </Banner>
    );
  }

  const autoEnabled   = shipping?.auto_shipping_profiles ?? true;
  const bootstrapped  = shipping?.shipping_profiles_bootstrapped ?? false;
  const warehouseCount = shipping?.warehouse_products ?? 0;
  const dropshipCount  = shipping?.dropship_products  ?? 0;

  return (
    <BlockStack gap="400">
      {/* 503 scope-missing error */}
      {scopeError && (
        <Banner title="Permission required" tone="critical">
          <BlockStack gap="200">
            <Text as="p">{scopeError}</Text>
            <Text as="p">
              <strong>Step 1:</strong> Close and reopen the AOA Sync app from
              your Shopify Admin sidebar — Shopify will prompt you to grant the
              &nbsp;<code>write_shipping</code> permission.
            </Text>
            <Text as="p">
              <strong>Step 2:</strong> Once permission is granted, re-enable
              automatic shipping profiles using the button below, then click
              &ldquo;Set up shipping profiles&rdquo;.
            </Text>
          </BlockStack>
        </Banner>
      )}

      {/* Disabled state */}
      {!autoEnabled && (
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Shipping Profiles</Text>
                <Text as="p" tone="subdued">
                  Automatic shipping profile management is currently disabled.
                </Text>
              </BlockStack>
              <Badge>Disabled</Badge>
            </InlineStack>
            <Divider />
            <Text as="p" tone="subdued">
              When enabled, AOA automatically maintains two shipping profiles in
              your store — one for warehouse-fulfilled products and one for
              dropship products. You then add your rates in Shopify&apos;s
              shipping settings.
            </Text>
            <InlineStack>
              <Button
                variant="primary"
                onClick={() => toggleAutoMutation.mutate(true)}
                loading={toggleAutoMutation.isPending}
              >
                Enable automatic shipping profiles
              </Button>
            </InlineStack>
            {toggleAutoMutation.isError && (
              <Banner tone="critical">
                <Text as="p">
                  {toggleAutoMutation.error instanceof ApiError
                    ? toggleAutoMutation.error.message
                    : 'Could not update setting. Please try again.'}
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Card>
      )}

      {/* Enabled but not bootstrapped */}
      {autoEnabled && !bootstrapped && (
        <Banner
          title="Shipping profiles not configured"
          tone="warning"
        >
          <BlockStack gap="300">
            <Text as="p">
              AOA automatically creates two shipping profiles in your store —
              one for warehouse-fulfilled products and one for dropship products.
              Set them up now, then go to Shopify Settings &rarr; Shipping to
              add your carrier rates.
            </Text>
            <InlineStack gap="300" blockAlign="center">
              <Button
                variant="primary"
                onClick={() => bootstrapMutation.mutate()}
                loading={bootstrapMutation.isPending}
                disabled={bootstrapMutation.isPending}
              >
                Set up shipping profiles
              </Button>
              <Button
                variant="plain"
                tone="critical"
                onClick={() => toggleAutoMutation.mutate(false)}
                loading={toggleAutoMutation.isPending}
                disabled={bootstrapMutation.isPending}
              >
                Disable
              </Button>
            </InlineStack>
            {bootstrapMutation.isPending && (
              <Text as="p" tone="subdued">
                Setting up shipping profiles — this may take up to 2 minutes
                for large stores. Please wait&hellip;
              </Text>
            )}
            {bootstrapMutation.isError && !scopeError && (
              <Banner tone="critical">
                <Text as="p">
                  {bootstrapMutation.error instanceof ApiError
                    ? bootstrapMutation.error.message
                    : 'An unexpected error occurred. Please try again.'}
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Banner>
      )}

      {/* Bootstrapped — show counts and admin link */}
      {autoEnabled && bootstrapped && (
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h2">Shipping Profiles</Text>
              <Badge tone="success">Active</Badge>
            </InlineStack>
            <Divider />
            <InlineStack gap="600">
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">Warehouse</Text>
                <Text as="span" fontWeight="medium">
                  {warehouseCount.toLocaleString()} product
                  {warehouseCount !== 1 ? 's' : ''}
                </Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="span" tone="subdued" variant="bodySm">Dropship</Text>
                <Text as="span" fontWeight="medium">
                  {dropshipCount.toLocaleString()} product
                  {dropshipCount !== 1 ? 's' : ''}
                </Text>
              </BlockStack>
            </InlineStack>
            <Divider />
            <InlineStack gap="400" align="space-between">
              <InlineStack gap="300">
                {adminShippingUrl && (
                  <Button
                    variant="plain"
                    onClick={() =>
                      window.open(adminShippingUrl, '_blank', 'noopener,noreferrer')
                    }
                  >
                    View in Shopify Admin &rarr;
                  </Button>
                )}
                <Button
                  variant="plain"
                  onClick={() => bootstrapMutation.mutate()}
                  loading={bootstrapMutation.isPending}
                  disabled={bootstrapMutation.isPending}
                >
                  Re-sync profiles
                </Button>
              </InlineStack>
              <Button
                variant="plain"
                tone="critical"
                onClick={() => toggleAutoMutation.mutate(false)}
                loading={toggleAutoMutation.isPending}
                disabled={bootstrapMutation.isPending}
              >
                Disable
              </Button>
            </InlineStack>
            {bootstrapMutation.isPending && (
              <Text as="p" tone="subdued">
                Re-syncing profiles — this may take up to 2 minutes&hellip;
              </Text>
            )}
            {bootstrapMutation.isError && !scopeError && (
              <Banner tone="critical">
                <Text as="p">
                  {bootstrapMutation.error instanceof ApiError
                    ? bootstrapMutation.error.message
                    : 'An unexpected error occurred. Please try again.'}
                </Text>
              </Banner>
            )}
            {bootstrapMutation.isSuccess && !bootstrapMutation.data.skipped && (
              <Banner title="Profiles updated" tone="success">
                <Text as="p">{bootstrapMutation.data.message}</Text>
              </Banner>
            )}
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [selectedTab, setSelectedTab] = useState(0);
  const {
    shop,
    syncHealth,
    subscription,
    isLoading,
    isError,
    error,
    refetch,
  } = useMerchantContext();

  const isFreePlan =
    !subscription?.planId || subscription.planId === 'free';

  const shopDomain = shop?.domain;

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
      subtitle="Billing, sync health, markup, collections, and shipping"
    >
      <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="500">
          {selectedTab === 0 && <BillingTab subscription={subscription} shopDomain={shopDomain} />}
          {selectedTab === 1 && <SyncHealthTab syncHealth={syncHealth} />}
          {selectedTab === 2 && <MarkupTab />}
          {selectedTab === 3 && <CollectionsTab isFreePlan={isFreePlan} />}
          {selectedTab === 4 && <ShippingTab shopDomain={shopDomain} />}
        </Box>
      </Tabs>
    </Page>
  );
}
