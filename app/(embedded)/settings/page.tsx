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
import { getCollections, bootstrapCollections, reconcileCollections } from '@/lib/api/collections';
import { getShipping, bootstrapShipping, reconcileShipping } from '@/lib/api/shipping';
import {
  getPaymentMethod,
  deletePaymentMethod,
  createSetupIntent,
  savePaymentMethod,
} from '@/lib/api/orders';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
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
  { id: 'billing',     content: 'Billing'          },
  { id: 'sync',        content: 'Sync Health'       },
  { id: 'markup',      content: 'Markup'            },
  { id: 'collections', content: 'Collections'       },
  { id: 'shipping',    content: 'Shipping'          },
  { id: 'payment',     content: 'Payment Method'    },
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
  const [autoPricingBanner, setAutoPricingBanner] = useState<'enabled' | 'disabled' | null>(null);

  // Auto-fill local state — not saved until "Save" is clicked
  const [localPushRetail, setLocalPushRetail] = useState(false);
  const [localPushVds, setLocalPushVds] = useState(false);
  const [autoFillModalOpen, setAutoFillModalOpen] = useState(false);
  const [autoFillNewlyEnabled, setAutoFillNewlyEnabled] = useState<{ retail: boolean; vds: boolean }>({ retail: false, vds: false });

  // Slot sub-limit state (empty string = no cap)
  const [localRetailCap, setLocalRetailCap] = useState('');
  const [localVdsCap,    setLocalVdsCap]    = useState('');

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
      // Seed local auto-fill state from server (only on first load)
      setLocalPushRetail(settings.push_retail ?? false);
      setLocalPushVds(settings.push_vds ?? false);
      // Seed slot caps
      setLocalRetailCap(settings.retail_slot_cap != null ? String(settings.retail_slot_cap) : '');
      setLocalVdsCap(settings.vds_slot_cap != null ? String(settings.vds_slot_cap) : '');
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

  const handleAutoPricingToggle = () => {
    const current = settings?.use_auto_pricing ?? false;
    const next = !current;
    updateMutation.mutate({ use_auto_pricing: next });
    setAutoPricingBanner(next ? 'enabled' : 'disabled');
  };

  // Separate mutation for auto-fill flags so it doesn't conflict with markup saves
  const autoFillMutation = useMutation({
    mutationFn: (body: { push_retail: boolean; push_vds: boolean }) =>
      updateSettings(body),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      const prevRetail = settings?.push_retail ?? false;
      const prevVds    = settings?.push_vds    ?? false;
      const newlyRetail = !prevRetail && vars.push_retail;
      const newlyVds    = !prevVds    && vars.push_vds;
      if (newlyRetail || newlyVds) {
        setAutoFillNewlyEnabled({ retail: newlyRetail, vds: newlyVds });
        setAutoFillModalOpen(true);
      }
    },
  });

  const slotCapMutation = useMutation({
    mutationFn: (body: { retail_slot_cap?: number; vds_slot_cap?: number }) => updateSettings(body),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['settings'] }); },
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

  const useAutoPricing = settings?.use_auto_pricing ?? false;

  const priceSyncQueued =
    updateMutation.isSuccess && updateMutation.data?.price_sync === 'queued';
  const noChange =
    updateMutation.isSuccess && updateMutation.data?.price_sync === 'not_needed';

  return (
    <BlockStack gap="400">
      {autoPricingBanner === 'enabled' && (
        <Banner title="Auto-pricing re-enabled" tone="success" onDismiss={() => setAutoPricingBanner(null)}>
          <Text as="p">
            Prices are syncing to Shopify now using your markup settings (~10 minutes).
          </Text>
        </Banner>
      )}
      {autoPricingBanner === 'disabled' && (
        <Banner title="Manual pricing enabled" tone="info" onDismiss={() => setAutoPricingBanner(null)}>
          <Text as="p">
            You can now set individual product prices from the <strong>Catalog</strong> page.
          </Text>
        </Banner>
      )}
      {!useAutoPricing && !autoPricingBanner && (
        <Banner title="Manual pricing mode" tone="info">
          <Text as="p">
            Auto-pricing is off. Set prices individually from the Catalog page.
            Re-enable auto-pricing below to resume markup-based pricing.
          </Text>
        </Banner>
      )}
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

      {/* Auto-pricing toggle */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">Auto-pricing</Text>
              <Text as="p" tone="subdued">
                When on, AOA calculates list prices from your markup settings automatically.
                Turn off to set prices manually per product from the Catalog page.
              </Text>
            </BlockStack>
            <Button
              variant={useAutoPricing ? 'primary' : 'secondary'}
              loading={updateMutation.isPending}
              onClick={handleAutoPricingToggle}
            >
              {useAutoPricing ? 'On — switch to manual' : 'Off — re-enable auto'}
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {useAutoPricing && (
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
      )}

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
            checked={localPushRetail}
            onChange={setLocalPushRetail}
            disabled={autoFillMutation.isPending}
          />
          <Checkbox
            label="Auto-fill dropship products"
            helpText="Automatically add VDS dropship products up to your plan limit on each sync."
            checked={localPushVds}
            onChange={setLocalPushVds}
            disabled={autoFillMutation.isPending}
          />

          {autoFillMutation.isError && (
            <Banner title="Could not save auto-fill settings" tone="critical">
              <Text as="p">
                {autoFillMutation.error instanceof ApiError
                  ? autoFillMutation.error.message
                  : 'An unexpected error occurred. Please try again.'}
              </Text>
            </Banner>
          )}

          <InlineStack>
            <Button
              variant="primary"
              loading={autoFillMutation.isPending}
              disabled={autoFillMutation.isPending}
              onClick={() =>
                autoFillMutation.mutate({ push_retail: localPushRetail, push_vds: localPushVds })
              }
            >
              Save auto-fill settings
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Per-type slot sub-limits (advanced) — only shown once settings are loaded */}
      {settings != null && (
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Per-type Slot Limits (Advanced)</Text>
            <Text as="p" tone="subdued">
              Set a maximum number of SKUs that can be auto-filled per product type.
              Leave blank to use your plan’s combined ceiling for both types.
              Currently the backend does not support removing a cap once set — contact support if needed.
            </Text>
            <Divider />
            <InlineStack gap="400">
              <TextField
                label="Retail (warehouse) cap"
                type="number"
                value={localRetailCap}
                onChange={setLocalRetailCap}
                min={1}
                autoComplete="off"
                helpText={`Current: ${settings.retail_slot_cap != null ? settings.retail_slot_cap.toLocaleString() : 'no limit'}`}
                error={localRetailCap !== '' && (isNaN(parseInt(localRetailCap, 10)) || parseInt(localRetailCap, 10) < 1)
                  ? 'Must be at least 1' : undefined}
              />
              <TextField
                label="VDS (dropship) cap"
                type="number"
                value={localVdsCap}
                onChange={setLocalVdsCap}
                min={1}
                autoComplete="off"
                helpText={`Current: ${settings.vds_slot_cap != null ? settings.vds_slot_cap.toLocaleString() : 'no limit'}`}
                error={localVdsCap !== '' && (isNaN(parseInt(localVdsCap, 10)) || parseInt(localVdsCap, 10) < 1)
                  ? 'Must be at least 1' : undefined}
              />
            </InlineStack>
            {slotCapMutation.isError && (
              <Banner title="Could not save slot limits" tone="critical">
                <Text as="p">
                  {slotCapMutation.error instanceof ApiError
                    ? slotCapMutation.error.message
                    : 'An unexpected error occurred.'}
                </Text>
              </Banner>
            )}
            {slotCapMutation.isSuccess && (
              <Banner title="Slot limits saved" tone="success" onDismiss={() => slotCapMutation.reset()}>
                <Text as="p">Changes will take effect on the next sync run.</Text>
              </Banner>
            )}
            <InlineStack>
              <Button
                variant="primary"
                loading={slotCapMutation.isPending}
                disabled={slotCapMutation.isPending || (localRetailCap === '' && localVdsCap === '')}
                onClick={() => {
                  const retail = localRetailCap !== '' ? parseInt(localRetailCap, 10) : undefined;
                  const vds    = localVdsCap    !== '' ? parseInt(localVdsCap,    10) : undefined;
                  slotCapMutation.mutate({
                    ...(retail != null && !isNaN(retail) ? { retail_slot_cap: retail } : {}),
                    ...(vds    != null && !isNaN(vds)    ? { vds_slot_cap:    vds    } : {}),
                  });
                }}
              >
                Save slot limits
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      )}

      {/* Post-save modal — shown only when a flag was newly enabled */}
      {(() => {
        const { retail, vds } = autoFillNewlyEnabled;
        const enabledLabel =
          retail && vds ? 'Warehouse and Dropship products' :
          retail        ? 'Warehouse products' :
                          'Dropship products';
        return (
          <Modal
            open={autoFillModalOpen}
            onClose={() => setAutoFillModalOpen(false)}
            title="Products ready to add"
            primaryAction={{
              content: 'Go to Catalog & Add Products',
              onAction: () => {
                setAutoFillModalOpen(false);
                window.location.href = '/products?action=push_all';
              },
            }}
            secondaryActions={[
              { content: "I'll do it later", onAction: () => setAutoFillModalOpen(false) },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text as="p">
                  You&apos;ve enabled auto-fill for <strong>{enabledLabel}</strong>.
                  Your catalog has products available to add to your Shopify store right now.
                  Add them now, or come back to the Catalog page anytime.
                </Text>
                <Banner tone="warning">
                  <Text as="p">
                    ⚠ Adding products will use your plan&apos;s available slots.
                    You can remove products individually from the Catalog page.
                  </Text>
                </Banner>
              </BlockStack>
            </Modal.Section>
          </Modal>
        );
      })()}
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// Collections Tab
// ---------------------------------------------------------------------------

function CollectionsTab({ isFreePlan }: { isFreePlan: boolean }) {
  const queryClient = useQueryClient();

  // Pull saved brand preferences from settings (cache is warm from Markup tab)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
    enabled: !isFreePlan,
  });

  const [bootstrapBrands, setBootstrapBrands] = useState(false);
  const [minBrandProducts, setMinBrandProducts] = useState('5');

  // Initialise from saved settings once loaded
  useEffect(() => {
    if (settings) {
      setBootstrapBrands(settings.bootstrap_brands ?? false);
      setMinBrandProducts(String(settings.min_brand_products ?? 5));
    }
  }, [settings]);

  // Reconcile runs once on mount — checks live Shopify state and removes stale
  // DB entries for collections that were manually deleted in Shopify Admin.
  const reconcileMutation = useMutation({
    mutationFn: reconcileCollections,
  });

  useEffect(() => {
    if (!isFreePlan) reconcileMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreePlan]);

  const bootstrapMutation = useMutation({
    mutationFn: bootstrapCollections,
    onSuccess: () => {
      // Re-reconcile after bootstrap so counts reflect reality
      reconcileMutation.mutate();
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // Use the most up-to-date counts: bootstrap result > reconcile result > nothing
  const counts = bootstrapMutation.data ?? reconcileMutation.data ?? null;
  const isBooted = counts?.collections_bootstrapped ?? false;
  const staleMissing = reconcileMutation.data?.removed ?? 0;
  const isLoading = reconcileMutation.isPending && !reconcileMutation.data;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text variant="headingMd" as="h2">Smart Collections</Text>
          {!isFreePlan && !isLoading && counts && (
            <Badge tone={isBooted ? 'success' : 'info'}>
              {isBooted ? `${counts.total} collections` : 'Not set up'}
            </Badge>
          )}
        </InlineStack>
        <Divider />
        <Text as="p" tone="subdued">
          Automatically create Shopify smart collections for each product
          category (e.g. &ldquo;Office Supplies&rdquo;, &ldquo;Furniture&rdquo;) and
          optionally for brands. Products are assigned by Shopify&apos;s rules
          engine — you can edit the rules at any time in Shopify Admin.
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
            {/* Current counts */}
            {!isLoading && counts && (
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Category collections</Text>
                  <Text as="span" fontWeight="medium">
                    {counts.category_collections}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Brand collections</Text>
                  <Text as="span" fontWeight="medium">
                    {counts.brand_collections}
                  </Text>
                </InlineStack>
              </BlockStack>
            )}

            {/* Stale collections warning */}
            {staleMissing > 0 && !bootstrapMutation.isSuccess && (
              <Banner title="Collections deleted in Shopify" tone="warning">
                <Text as="p">
                  {staleMissing} collection{staleMissing !== 1 ? 's were' : ' was'} deleted
                  from your Shopify store. Click &ldquo;Rebuild collections&rdquo; below to
                  recreate {staleMissing !== 1 ? 'them' : 'it'}.
                </Text>
              </Banner>
            )}

            <Divider />

            {/* Brand collections options */}
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">Brand collections</Text>
              <Checkbox
                label="Include brand collections"
                helpText="Creates one collection per brand. Only brands with at least the minimum number of SKUs will get a collection."
                checked={bootstrapBrands}
                onChange={setBootstrapBrands}
              />
              {bootstrapBrands && (
                <Box maxWidth="200px">
                  <TextField
                    label="Min. products per brand"
                    helpText="Brands with fewer SKUs are skipped."
                    type="number"
                    min={1}
                    value={minBrandProducts}
                    onChange={setMinBrandProducts}
                    autoComplete="off"
                  />
                </Box>
              )}
            </BlockStack>

            {bootstrapMutation.isSuccess && (
              <Banner title="Collections created" tone="success">
                <Text as="p">
                  {bootstrapMutation.data.category_collections} category
                  {bootstrapMutation.data.brand_collections > 0
                    ? ` + ${bootstrapMutation.data.brand_collections} brand`
                    : ''}{' '}
                  ({bootstrapMutation.data.total} total) collections are set up
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
                onClick={() =>
                  bootstrapMutation.mutate(
                    bootstrapBrands
                      ? {
                          bootstrap_brands: true,
                          min_brand_products:
                            parseInt(minBrandProducts, 10) || 5,
                        }
                      : undefined
                  )
                }
                loading={bootstrapMutation.isPending}
                disabled={bootstrapMutation.isPending}
              >
                {isBooted
                  ? staleMissing > 0 ? 'Rebuild collections' : 'Rebuild collections'
                  : 'Set up collections'}
              </Button>
            </InlineStack>

            {bootstrapMutation.isPending && (
              <Text as="p" tone="subdued">
                Setting up collections — this can take 30–120 seconds for large
                catalogs. Please wait&hellip;
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

  const [reconcileResult,     setReconcileResult]     = useState<string | null>(null);
  const [reconcileResultTone, setReconcileResultTone] = useState<'success' | 'info' | 'critical'>('success');

  const reconcileMutation = useMutation({
    mutationFn: reconcileShipping,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['shipping'] });
      if (data.healthy) {
        setReconcileResult('Shipping profiles are healthy. No action needed.');
        setReconcileResultTone('success');
      } else if (data.recovered) {
        setReconcileResult(
          `Shipping profiles were restored. ${data.warehouse_products} warehouse and ${data.dropship_products} dropship products reassigned. Go to Shopify Admin → Settings → Shipping and delivery to verify your rates.`
        );
        setReconcileResultTone('success');
      } else if (data.repaired_zones) {
        setReconcileResult(data.message);
        setReconcileResultTone('success');
      } else if (data.skipped) {
        setReconcileResult(data.message);
        setReconcileResultTone('info');
      }
      setScopeError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 503) {
        setScopeError(err.message);
      } else {
        setReconcileResult('Repair failed. Please try again or contact support.');
        setReconcileResultTone('critical');
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

      {/* Reconcile result banner */}
      {reconcileResult && (
        <Banner
          tone={reconcileResultTone}
          onDismiss={() => setReconcileResult(null)}
        >
          <Text as="p">{reconcileResult}</Text>
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
                disabled={bootstrapMutation.isPending || reconcileMutation.isPending}
              >
                Set up shipping profiles
              </Button>
              <Button
                onClick={() => { setReconcileResult(null); reconcileMutation.mutate(); }}
                loading={reconcileMutation.isPending}
                disabled={bootstrapMutation.isPending || reconcileMutation.isPending}
              >
                {reconcileMutation.isPending ? 'Checking shipping profiles…' : 'Repair Shipping Profiles'}
              </Button>
              <Button
                variant="plain"
                tone="critical"
                onClick={() => toggleAutoMutation.mutate(false)}
                loading={toggleAutoMutation.isPending}
                disabled={bootstrapMutation.isPending || reconcileMutation.isPending}
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
            {reconcileMutation.isPending && (
              <Text as="p" tone="subdued">
                Checking shipping profiles — this may take up to 2 minutes. Please wait&hellip;
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
                  disabled={bootstrapMutation.isPending || reconcileMutation.isPending}
                >
                  Re-sync profiles
                </Button>
                <Button
                  variant="plain"
                  onClick={() => { setReconcileResult(null); reconcileMutation.mutate(); }}
                  loading={reconcileMutation.isPending}
                  disabled={bootstrapMutation.isPending || reconcileMutation.isPending}
                >
                  {reconcileMutation.isPending ? 'Checking shipping profiles…' : 'Repair Shipping Profiles'}
                </Button>
              </InlineStack>
              <Button
                variant="plain"
                tone="critical"
                onClick={() => toggleAutoMutation.mutate(false)}
                loading={toggleAutoMutation.isPending}
                disabled={bootstrapMutation.isPending || reconcileMutation.isPending}
              >
                Disable
              </Button>
            </InlineStack>
            {bootstrapMutation.isPending && (
              <Text as="p" tone="subdued">
                Re-syncing profiles — this may take up to 2 minutes&hellip;
              </Text>
            )}
            {reconcileMutation.isPending && (
              <Text as="p" tone="subdued">
                Checking shipping profiles — this may take up to 2 minutes. Please wait&hellip;
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
// Payment Tab — Stripe card management
// ---------------------------------------------------------------------------

/**
 * Inner form rendered inside <Elements>.  Needs stripe/elements hooks which
 * must be called inside an Elements provider.
 */
function CardSetupForm({
  clientSecret,
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  const saveMutation = useMutation({
    mutationFn: savePaymentMethod,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stripePaymentMethod'] });
      setSaving(false);
      onSuccess();
    },
    onError: (err) => {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not save card. Please try again.',
      );
      setSaving(false);
    },
  });

  async function handleSubmit() {
    if (!stripe || !elements) return;
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setFormError(null);
    setSaving(true);

    const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (stripeError) {
      setFormError(stripeError.message ?? 'Card setup failed. Please try again.');
      setSaving(false);
      return;
    }

    if (setupIntent?.payment_method) {
      saveMutation.mutate({ payment_method_id: setupIntent.payment_method as string });
    }
  }

  return (
    <BlockStack gap="400">
      <div
        style={{
          border: '1px solid var(--p-color-border)',
          borderRadius: '8px',
          padding: '12px',
          background: 'var(--p-color-bg-surface)',
        }}
      >
        <CardElement options={{ hidePostalCode: true }} />
      </div>
      {formError && (
        <Banner tone="critical">
          <Text as="p">{formError}</Text>
        </Banner>
      )}
      <InlineStack gap="300">
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={saving || saveMutation.isPending}
          disabled={!stripe}
        >
          Save card
        </Button>
        <Button onClick={onCancel} disabled={saving || saveMutation.isPending}>
          Cancel
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

function PaymentTab() {
  const queryClient = useQueryClient();

  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [setupOpen,         setSetupOpen]         = useState(false);
  const [setupInitialising, setSetupInitialising] = useState(false);
  const [setupError,        setSetupError]        = useState<string | null>(null);
  const [stripePromise,     setStripePromise]     =
    useState<ReturnType<typeof loadStripe> | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);

  const {
    data: paymentMethod,
    isLoading,
    isError,
    error: pmError,
    refetch,
  } = useQuery({
    queryKey: ['stripePaymentMethod'],
    queryFn:  getPaymentMethod,
    staleTime: 60_000,
  });

  const removeMutation = useMutation({
    mutationFn: deletePaymentMethod,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stripePaymentMethod'] });
      setRemoveConfirmOpen(false);
    },
  });

  async function handleOpenSetup() {
    setSetupError(null);
    setSetupInitialising(true);
    try {
      const intent = await createSetupIntent();
      // Persist publishable key for 3DS confirmation on the order detail page
      sessionStorage.setItem('aoa_stripe_pk', intent.stripe_publishable_key);
      setStripePromise(loadStripe(intent.stripe_publishable_key));
      setSetupClientSecret(intent.client_secret);
      setSetupOpen(true);
    } catch (err) {
      setSetupError(
        err instanceof ApiError
          ? err.message
          : 'Could not start card setup. Please try again.',
      );
    } finally {
      setSetupInitialising(false);
    }
  }

  function handleSetupSuccess() {
    setSetupOpen(false);
    setSetupClientSecret(null);
    setStripePromise(null);
  }

  function handleCancelSetup() {
    setSetupOpen(false);
    setSetupClientSecret(null);
    setStripePromise(null);
  }

  if (isLoading) return <Card><SkeletonBodyText lines={4} /></Card>;

  if (isError) {
    return (
      <Banner
        title="Could not load payment method"
        tone="critical"
        action={{ content: 'Retry', onAction: refetch }}
      >
        <Text as="p">
          {pmError instanceof ApiError
            ? pmError.message
            : 'An unexpected error occurred.'}
        </Text>
      </Banner>
    );
  }

  const hasCard = paymentMethod?.has_payment_method ?? false;
  const cardBrand = paymentMethod?.card_brand
    ? paymentMethod.card_brand.charAt(0).toUpperCase() + paymentMethod.card_brand.slice(1)
    : 'Card';

  return (
    <BlockStack gap="400">
      {/* ---- Remove card confirm modal ---- */}
      <Modal
        open={removeConfirmOpen}
        title="Remove payment method"
        onClose={() => setRemoveConfirmOpen(false)}
        primaryAction={{
          content: 'Remove',
          destructive: true,
          loading: removeMutation.isPending,
          onAction: () => removeMutation.mutate(),
        }}
        secondaryActions={[{
          content: 'Cancel',
          onAction: () => setRemoveConfirmOpen(false),
        }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Are you sure you want to remove your saved card? You will not be able to
              purchase orders until you add a new payment method.
            </Text>
            {removeMutation.isError && (
              <Banner tone="critical">
                <Text as="p">
                  {removeMutation.error instanceof ApiError
                    ? removeMutation.error.message
                    : 'Could not remove card. Please try again.'}
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ---- Setup initialisation error ---- */}
      {setupError && (
        <Banner
          title="Card setup failed"
          tone="critical"
          onDismiss={() => setSetupError(null)}
        >
          <Text as="p">{setupError}</Text>
        </Banner>
      )}

      {/* ---- Saved card / empty state ---- */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between">
            <Text variant="headingMd" as="h2">Payment Method</Text>
            {hasCard && <Badge tone="success">Saved</Badge>}
          </InlineStack>
          <Divider />
          {hasCard ? (
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="p" fontWeight="medium">
                  {cardBrand} ending in {paymentMethod!.card_last4}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Used to pay for AOA order purchases
                </Text>
              </BlockStack>
              <InlineStack gap="300">
                <Button
                  onClick={handleOpenSetup}
                  loading={setupInitialising}
                  disabled={setupInitialising || setupOpen}
                >
                  Replace card
                </Button>
                <Button
                  tone="critical"
                  onClick={() => setRemoveConfirmOpen(true)}
                  disabled={setupInitialising || setupOpen}
                >
                  Remove
                </Button>
              </InlineStack>
            </InlineStack>
          ) : (
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                No payment method saved. Add a card to enable order purchasing.
              </Text>
              <InlineStack>
                <Button
                  variant="primary"
                  onClick={handleOpenSetup}
                  loading={setupInitialising}
                  disabled={setupInitialising || setupOpen}
                >
                  Add card
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      {/* ---- Inline card entry form (shown after setup intent is created) ---- */}
      {setupOpen && stripePromise && setupClientSecret && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Enter card details</Text>
            <Divider />
            <Elements stripe={stripePromise} options={{ clientSecret: setupClientSecret }}>
              <CardSetupForm
                clientSecret={setupClientSecret}
                onSuccess={handleSetupSuccess}
                onCancel={handleCancelSetup}
              />
            </Elements>
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
  const [selectedTab, setSelectedTab] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'payment') return 5;
    if (tab === 'shipping') return 4;
    if (tab === 'collections') return 3;
    if (tab === 'markup') return 2;
    if (tab === 'sync') return 1;
    return 0;
  });
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
      subtitle="Billing, sync health, markup, collections, shipping, and payment"
    >
      <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="500">
          {selectedTab === 0 && <BillingTab subscription={subscription} shopDomain={shopDomain} />}
          {selectedTab === 1 && <SyncHealthTab syncHealth={syncHealth} />}
          {selectedTab === 2 && <MarkupTab />}
          {selectedTab === 3 && <CollectionsTab isFreePlan={isFreePlan} />}
          {selectedTab === 4 && <ShippingTab shopDomain={shopDomain} />}
          {selectedTab === 5 && <PaymentTab />}
        </Box>
      </Tabs>
    </Page>
  );
}
