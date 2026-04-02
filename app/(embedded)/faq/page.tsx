'use client';

/**
 * app/(embedded)/faq/page.tsx
 *
 * Frequently Asked Questions — answers common merchant questions about
 * pricing, sync behaviour, product counts, and catalog management.
 */

import { useState } from 'react';
import { Page, Card, BlockStack, Text, Collapsible, Button, Divider, InlineStack, Box, Badge } from '@shopify/polaris';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface FaqItem {
  id: string;
  question: string;
  answer: React.ReactNode;
  tag?: 'Pricing' | 'Catalog' | 'Shopify' | 'Sync';
}

const FAQ_ITEMS: FaqItem[] = [
  // ── Catalog & counts ─────────────────────────────────────────────────────
  {
    id: 'variant-count',
    tag: 'Catalog',
    question: 'Why does my "Products in Shopify" count look different from what I see in Shopify?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          AOA tracks <strong>variants</strong>, not just products. Some dropship (VDS) products have two pricing
          tiers — a single-unit price and a case/multi-unit price. Each tier is a separate Shopify variant on
          the same product listing.
        </Text>
        <Text as="p">
          For example: if you have 25 products and 8 of those are dropship products with a Tier 2 variant,
          Shopify will show 25 product listings but AOA will report 33 variants (25 + 8 extra tier variants).
          The summary bar shows <strong>Products in Shopify</strong> (the number of listings) alongside
          <strong> total variants</strong> so you always know which is which.
        </Text>
      </BlockStack>
    ),
  },
  {
    id: 'tier2',
    tag: 'Catalog',
    question: 'What is a Tier 2 variant?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          Certain dropship products are available in both single-unit and case-pack quantities. AOA creates
          two Shopify variants for these products:
        </Text>
        <Text as="p">• <strong>Tier 1</strong> — single unit at the standard price</Text>
        <Text as="p">• <strong>Tier 2</strong> — case/multi-unit pack at a lower per-unit cost</Text>
        <Text as="p">
          Both variants are created automatically when you push the product. You can see which products
          have Tier 2 variants in the <strong>Dropship — w/ Tier 2</strong> count on the Products page.
        </Text>
      </BlockStack>
    ),
  },
  {
    id: 'slots',
    tag: 'Catalog',
    question: 'What counts toward my plan slot limit?',
    answer: (
      <Text as="p">
        Each <strong>unique product</strong> (SKU) counts as one slot, regardless of how many tier variants
        it has. A dropship product with both Tier 1 and Tier 2 variants still uses only one slot.
        Your slot usage is shown in the progress bar at the top of the Products page.
      </Text>
    ),
  },

  // ── Pricing ──────────────────────────────────────────────────────────────
  {
    id: 'auto-vs-manual',
    tag: 'Pricing',
    question: 'What is the difference between Auto-pricing and Manual pricing?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          <strong>Auto-pricing</strong> — AOA automatically calculates your Shopify price by applying your
          markup percentage to the AOA cost price. Whenever costs change, prices update automatically.
          Configure your markup in <strong>Settings → Markup</strong>.
        </Text>
        <Text as="p">
          <strong>Manual pricing</strong> — You set the Shopify price for each product individually using
          the <strong>Edit</strong> button in the Your price column. AOA stores this price and syncs it to
          Shopify. Costs changing will not automatically change your price.
        </Text>
        <Text as="p">
          Switch between modes at any time in <strong>Settings → Markup → Auto-pricing</strong>.
          Switching to auto-pricing will trigger a full price re-sync across all your products (~10 minutes).
        </Text>
      </BlockStack>
    ),
  },
  {
    id: 'edit-price-in-shopify',
    tag: 'Pricing',
    question: 'If I edit a product price directly in Shopify Admin, will it be saved in AOA?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          <strong>No.</strong> Price changes made directly in Shopify Admin are not reflected back to AOA.
          The sync is one-way: AOA → Shopify.
        </Text>
        <Text as="p">
          If you edit a price in Shopify and AOA later runs a price sync (e.g. after a cost update or
          markup change), <strong>AOA will overwrite the price you set in Shopify</strong> with either:
        </Text>
        <Text as="p">• The markup-calculated price (if auto-pricing is on), or</Text>
        <Text as="p">• The last price you saved through AOA (if manual pricing is on)</Text>
        <Text as="p">
          Always use the <strong>Edit</strong> button in the AOA catalog to update prices in manual mode.
        </Text>
      </BlockStack>
    ),
  },
  {
    id: 'map-price',
    tag: 'Pricing',
    question: 'What is MAP and why does my product show a "Below MAP" warning?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          <strong>MAP (Minimum Advertised Price)</strong> is the lowest price a manufacturer allows
          retailers to advertise publicly. It is set by the brand, not by AOA.
        </Text>
        <Text as="p">
          When your Shopify price falls below the MAP, AOA shows a ⚠ Below MAP warning on the product row
          and in the Edit price modal. You can still save a below-MAP price — AOA does not block it — but
          selling below MAP may violate the brand's policy and risk losing your supplier access.
        </Text>
      </BlockStack>
    ),
  },

  // ── Sync ─────────────────────────────────────────────────────────────────
  {
    id: 'sync-frequency',
    tag: 'Sync',
    question: 'How often does AOA sync inventory and prices to Shopify?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          <strong>Inventory (qty)</strong> — synced automatically on a regular schedule. The last sync
          time is shown in the summary bar on the Products page.
        </Text>
        <Text as="p">
          <strong>Prices</strong> — synced immediately when you push a product or save a manual price.
          In auto-pricing mode, prices also re-sync when AOA cost prices change or when you update your
          markup settings.
        </Text>
        <Text as="p">
          Price updates typically appear in Shopify within <strong>1–10 minutes</strong>.
        </Text>
      </BlockStack>
    ),
  },
  {
    id: 'last-synced-qty',
    tag: 'Sync',
    question: 'Why does the Qty column show a different number than Shopify?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          The Qty column shows the <strong>current AOA warehouse stock</strong>. Shopify shows the
          quantity from the last sync. If they differ, a sync has not run since the warehouse quantity
          changed. The detail page shows both the current AOA qty and the "Last synced qty" so you
          can compare.
        </Text>
      </BlockStack>
    ),
  },

  // ── Shopify ───────────────────────────────────────────────────────────────
  {
    id: 'remove-product',
    tag: 'Shopify',
    question: 'What happens when I remove a product from my Shopify catalog in AOA?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          Removing a product via AOA <strong>deletes it from your Shopify store</strong> and frees up
          one plan slot. The product returns to the Available to Add pool and can be re-pushed at any time.
        </Text>
        <Text as="p">
          Note: removing a product in Shopify Admin directly does <strong>not</strong> update AOA —
          always remove through the AOA catalog to keep slot counts accurate.
        </Text>
      </BlockStack>
    ),
  },
  {
    id: 'product-status-unknown',
    tag: 'Shopify',
    question: 'Why does a product show "In Shopify" instead of "Active" or "Draft" in the status?',
    answer: (
      <BlockStack gap="200">
        <Text as="p">
          Each product in your Shopify store has a status of <strong>Active</strong> (visible to customers)
          or <strong>Draft</strong> (hidden from your storefront). AOA displays this status once it has
          been retrieved from Shopify.
        </Text>
        <Text as="p">
          <strong>"In Shopify"</strong> means the product is confirmed to be in your store, but AOA has
          not yet received the Active/Draft status from Shopify. This is expected to resolve automatically
          after the next sync cycle.
        </Text>
        <Text as="p">
          In the meantime, you can check the actual status by clicking <strong>View in Shopify Admin</strong>
           on the product detail page.
        </Text>
      </BlockStack>
    ),
  },
];

const TAG_TONES: Record<string, 'info' | 'warning' | 'success' | 'attention'> = {
  Pricing: 'warning',
  Catalog: 'info',
  Shopify: 'success',
  Sync:    'attention',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FaqPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = Array.from(new Set(FAQ_ITEMS.map((f) => f.tag).filter(Boolean))) as string[];
  const filtered = activeTag ? FAQ_ITEMS.filter((f) => f.tag === activeTag) : FAQ_ITEMS;

  return (
    <Page title="FAQ" subtitle="Answers to common questions about AOA Sync">
      <BlockStack gap="400">
        {/* Tag filter */}
        <Card>
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text as="span" tone="subdued" variant="bodySm">Filter:</Text>
            <Button
              size="slim"
              variant={activeTag === null ? 'primary' : 'secondary'}
              onClick={() => setActiveTag(null)}
            >
              All
            </Button>
            {tags.map((tag) => (
              <Button
                key={tag}
                size="slim"
                variant={activeTag === tag ? 'primary' : 'secondary'}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              >
                {tag}
              </Button>
            ))}
          </InlineStack>
        </Card>

        {/* FAQ items */}
        <Card padding="0">
          <BlockStack gap="0">
            {filtered.map((item, i) => (
              <div key={item.id}>
                {i > 0 && <Divider />}
                <Box padding="400">
                  <BlockStack gap="300">
                    <button
                      onClick={() => setOpenId(openId === item.id ? null : item.id)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="center" gap="400">
                        <InlineStack gap="300" blockAlign="center" wrap>
                          {item.tag && (
                            <Badge tone={TAG_TONES[item.tag] ?? 'info'} size="small">
                              {item.tag}
                            </Badge>
                          )}
                          <Text as="span" fontWeight="semibold" variant="bodyMd">
                            {item.question}
                          </Text>
                        </InlineStack>
                        <Text as="span" tone="subdued" variant="bodyMd">
                          {openId === item.id ? '▲' : '▼'}
                        </Text>
                      </InlineStack>
                    </button>

                    <Collapsible
                      id={`faq-${item.id}`}
                      open={openId === item.id}
                      transition={{ duration: '150ms', timingFunction: 'ease-in-out' }}
                    >
                      <Box paddingBlockStart="200" paddingInlineStart="0">
                        {item.answer}
                      </Box>
                    </Collapsible>
                  </BlockStack>
                </Box>
              </div>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
