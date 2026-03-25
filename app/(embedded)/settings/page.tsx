'use client';

/**
 * app/(embedded)/settings/page.tsx
 *
 * Settings page — markup pricing configuration and collections management.
 *
 * Markup values:
 * - Stored and sent as decimal ratios (0.25 = 25%)
 * - Displayed and edited as percentages (25%)
 *
 * Collections:
 * - Bootstrap creates one Shopify smart collection per product category
 * - Only available on Starter plan and above
 */

import { useState, useEffect } from 'react';
import {
  Page,
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
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '@/lib/api/settings';
import { getCollections, bootstrapCollections } from '@/lib/api/collections';
import { useMerchantContext } from '@/hooks/useMerchantContext';
import { ApiError } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert decimal ratio to display percentage string e.g. 0.25 → "25" */
function toPercent(ratio: number): string {
  return (ratio * 100).toFixed(0);
}

/** Parse percentage input string to decimal ratio e.g. "25" → 0.25 */
function fromPercent(pct: string): number {
  return parseFloat(pct) / 100;
}

function isValidPercent(val: string): boolean {
  const n = parseFloat(val);
  return !isNaN(n) && n >= 0 && n <= 1000;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { subscription } = useMerchantContext();
  const isFreePlan = !subscription?.planId || subscription.planId === 'free';

  // Markup form state (percentage strings for display)
  const [retailPct, setRetailPct] = useState('');
  const [vdsPct, setVdsPct] = useState('');
  const [wholesalePct, setWholesalePct] = useState('');
  const [formDirty, setFormDirty] = useState(false);

  // Load settings
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    error: settingsErr,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  });

  // Populate form fields once on load (don't overwrite while user is editing)
  useEffect(() => {
    if (settings && !formDirty) {
      setRetailPct(toPercent(settings.markup_pct_retail));
      setVdsPct(toPercent(settings.markup_pct_vds));
      setWholesalePct(toPercent(settings.markup_pct_wholesale));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Load collections
  const {
    data: collections,
    isLoading: collectionsLoading,
  } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
    staleTime: 60_000,
    enabled: !isFreePlan,
  });

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      setFormDirty(false);
    },
  });

  // Bootstrap collections mutation
  const bootstrapMutation = useMutation({
    mutationFn: bootstrapCollections,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const handleSaveMarkup = () => {
    if (!isValidPercent(retailPct) || !isValidPercent(vdsPct) || !isValidPercent(wholesalePct)) {
      return;
    }
    updateMutation.mutate({
      markup_pct_retail: fromPercent(retailPct),
      markup_pct_vds: fromPercent(vdsPct),
      markup_pct_wholesale: fromPercent(wholesalePct),
    });
  };

  if (settingsLoading) {
    return (
      <SkeletonPage title="Settings">
        <Layout>
          <Layout.Section>
            <Card><SkeletonBodyText lines={5} /></Card>
          </Layout.Section>
          <Layout.Section>
            <Card><SkeletonBodyText lines={4} /></Card>
          </Layout.Section>
        </Layout>
      </SkeletonPage>
    );
  }

  if (settingsError) {
    return (
      <Page title="Settings">
        <Banner title="Could not load settings" tone="critical">
          <Text as="p">
            {settingsErr instanceof ApiError
              ? settingsErr.message
              : 'An unexpected error occurred. Please reload the page.'}
          </Text>
        </Banner>
      </Page>
    );
  }

  const priceSyncQueued = updateMutation.isSuccess && updateMutation.data?.price_sync === 'queued';
  const noChange = updateMutation.isSuccess && updateMutation.data?.price_sync === 'not_needed';

  return (
    <Page title="Settings" subtitle="Configure pricing markup and collections">
      <BlockStack gap="500">
        {/* Price sync queued banner */}
        {priceSyncQueued && (
          <Banner title="Prices are updating" tone="success">
            <Text as="p">
              Your store will reflect the new markup within 10 minutes.
              {updateMutation.data!.products_affected > 0
                ? ` ${updateMutation.data!.products_affected.toLocaleString()} products affected.`
                : ''}
            </Text>
          </Banner>
        )}

        {noChange && (
          <Banner title="No changes" tone="info">
            <Text as="p">The submitted values are the same as your current markup — nothing was updated.</Text>
          </Banner>
        )}

        {updateMutation.isError && (
          <Banner title="Could not save settings" tone="critical">
            <Text as="p">
              {updateMutation.error instanceof ApiError
                ? updateMutation.error.message
                : 'An unexpected error occurred. Please try again.'}
            </Text>
          </Banner>
        )}

        <Layout>
          {/* Markup settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Markup Pricing</Text>
                  {settings && (
                    <Text as="span" tone="subdued" variant="bodySm">
                      Current: Retail {toPercent(settings.markup_pct_retail)}% /
                      VDS {toPercent(settings.markup_pct_vds)}% /
                      Wholesale {toPercent(settings.markup_pct_wholesale)}%
                    </Text>
                  )}
                </InlineStack>
                <Divider />
                <Text as="p" tone="subdued">
                  Set the markup applied on top of AOA&apos;s cost price when syncing
                  products to your store. Changes trigger a background price update
                  (~10 minutes).
                </Text>

                <InlineStack gap="400">
                  <TextField
                    label="Retail markup (%)"
                    type="number"
                    value={retailPct}
                    onChange={(v) => { setRetailPct(v); setFormDirty(true); }}
                    suffix="%"
                    min={0}
                    max={1000}
                    autoComplete="off"
                    error={retailPct !== '' && !isValidPercent(retailPct) ? 'Enter a value between 0 and 1000' : undefined}
                  />
                  <TextField
                    label="VDS markup (%)"
                    type="number"
                    value={vdsPct}
                    onChange={(v) => { setVdsPct(v); setFormDirty(true); }}
                    suffix="%"
                    min={0}
                    max={1000}
                    autoComplete="off"
                    error={vdsPct !== '' && !isValidPercent(vdsPct) ? 'Enter a value between 0 and 1000' : undefined}
                  />
                  <TextField
                    label="Wholesale markup (%)"
                    type="number"
                    value={wholesalePct}
                    onChange={(v) => { setWholesalePct(v); setFormDirty(true); }}
                    suffix="%"
                    min={0}
                    max={1000}
                    autoComplete="off"
                    error={wholesalePct !== '' && !isValidPercent(wholesalePct) ? 'Enter a value between 0 and 1000' : undefined}
                  />
                </InlineStack>

                <InlineStack>
                  <Button
                    variant="primary"
                    onClick={handleSaveMarkup}
                    loading={updateMutation.isPending}
                    disabled={!formDirty || updateMutation.isPending}
                  >
                    Save markup
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Collections */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Smart Collections</Text>
                  {collections && (
                    <Badge tone={collections.collections_bootstrapped ? 'success' : 'info'}>
                      {collections.collections_bootstrapped ? `${collections.total} collections` : 'Not set up'}
                    </Badge>
                  )}
                </InlineStack>
                <Divider />
                <Text as="p" tone="subdued">
                  Automatically create one Shopify smart collection per product
                  category (e.g. &ldquo;Office Supplies&rdquo;, &ldquo;Furniture&rdquo;). Products are
                  assigned automatically by Shopify&apos;s rules engine.
                </Text>

                {isFreePlan && (
                  <Banner tone="warning">
                    <Text as="p">
                      Smart collections are available on the Starter plan and above.{' '}
                      <a href="/plans">Upgrade your plan</a> to enable this feature.
                    </Text>
                  </Banner>
                )}

                {!isFreePlan && (
                  <>
                    {!collectionsLoading && collections && (
                      <BlockStack gap="200">
                        <InlineStack align="space-between">
                          <Text as="span" tone="subdued">Category collections</Text>
                          <Text as="span" fontWeight="medium">{collections.category_collections}</Text>
                        </InlineStack>
                        <InlineStack align="space-between">
                          <Text as="span" tone="subdued">Brand collections</Text>
                          <Text as="span" fontWeight="medium">{collections.brand_collections}</Text>
                        </InlineStack>
                      </BlockStack>
                    )}

                    {bootstrapMutation.isSuccess && (
                      <Banner title="Collections created" tone="success">
                        <Text as="p">
                          {bootstrapMutation.data.total} collections have been set up in your Shopify store.
                        </Text>
                      </Banner>
                    )}

                    {bootstrapMutation.isError && (
                      <Banner title="Collections setup failed" tone="critical">
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
                        Setting up collections — this can take 30–120 seconds for large catalogs. Please wait…
                      </Text>
                    )}
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
