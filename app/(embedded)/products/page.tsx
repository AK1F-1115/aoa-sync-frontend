'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Page,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  TextField,
  Pagination,
  EmptyState,
  SkeletonPage,
  SkeletonBodyText,
  Box,
  Divider,
  Select,
  Spinner,
  Button,
  Tabs,
  ProgressBar,
  Checkbox,
  Link,
  Modal,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getCatalog, getCatalogSummary, getPushStatus, cancelPushJob, pushCatalog, removeCatalog, getRemoveStatus, patchProductPrice } from '@/lib/api/products';
import { getSettings } from '@/lib/api/settings';
import { ApiError } from '@/lib/api/client';
import type { CatalogProduct, CatalogSummary, CatalogParams, PlanLimitExceededDetail, PushAlreadyRunningDetail, RemoveCatalogRequest } from '@/types/api';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import type { WatchlistEntry } from '@/lib/hooks/useWatchlist';

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: string | number | null): string {
  if (price === null || price === undefined || price === '') return '—';
  const n = typeof price === 'number' ? price : parseFloat(price);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Parse the plan_limit_exceeded detail from a 400 ApiError, if present. */
function parsePlanLimitDetail(err: unknown): PlanLimitExceededDetail | null {
  if (!(err instanceof ApiError)) return null;
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    if (parsed?.error === 'plan_limit_exceeded') {
      return parsed as unknown as PlanLimitExceededDetail;
    }
  } catch {
    // plain string message — not a JSON detail
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

function getTagsByNamespace(tags: string[], ns: string): string[] {
  return tags.filter(t => t.startsWith(`${ns}:`)).map(t => t.slice(ns.length + 1));
}

const BARE_NOTICE_TAGS: Record<string, { label: string; tone: 'critical' | 'warning' | 'attention' | 'success' | 'info' }> = {
  'hazmat':               { label: 'Hazmat',          tone: 'critical'  },
  // prop65 (generic) intentionally omitted — it applies to nearly all catalog products
  // and provides no useful signal as a per-row badge.
  'prop65:ca-restricted': { label: 'Prop 65 CA restricted', tone: 'warning' },
  'non-returnable':       { label: 'Non-returnable',  tone: 'attention' },
  'new-arrival':          { label: 'New arrival',     tone: 'success'   },
};

const MARKETPLACE_NOTICE_TAGS: Record<string, { label: string; tone: 'critical' | 'warning' | 'attention' }> = {
  'prohibited':          { label: 'Restricted',    tone: 'critical'   },
  'no-amazon':           { label: 'No Amazon',     tone: 'attention'  },
  'authorized-only':     { label: 'Auth only',     tone: 'attention'  },
};

const STOCK_STATUS_TAGS: Record<string, { label: string; tone: 'warning' | 'info' }> = {
  'limited':             { label: 'Limited stock', tone: 'warning'    },
  'preorder':            { label: 'Preorder',      tone: 'info'       },
};

function ProductTagBadges({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;

  const badges: React.ReactNode[] = [];

  for (const [tag, cfg] of Object.entries(BARE_NOTICE_TAGS)) {
    if (tags.includes(tag)) badges.push(<Badge key={tag} tone={cfg.tone} size="small">{cfg.label}</Badge>);
  }
  for (const mkt of getTagsByNamespace(tags, 'marketplace')) {
    const cfg = MARKETPLACE_NOTICE_TAGS[mkt];
    if (cfg) badges.push(<Badge key={`mp-${mkt}`} tone={cfg.tone} size="small">{cfg.label}</Badge>);
  }
  for (const st of getTagsByNamespace(tags, 'stock-status')) {
    const cfg = STOCK_STATUS_TAGS[st];
    if (cfg) badges.push(<Badge key={`ss-${st}`} tone={cfg.tone} size="small">{cfg.label}</Badge>);
  }

  if (badges.length === 0) return null;
  return <InlineStack gap="100" blockAlign="center">{badges}</InlineStack>;
}

// ---------------------------------------------------------------------------
// Slot counter
// ---------------------------------------------------------------------------

function SlotCounter({
  slotsUsed,
  slotsTotal,
  slotsRemaining,
}: {
  slotsUsed: number;
  slotsTotal: number | null;
  slotsRemaining: number | null;
}) {
  const isUnlimited = slotsTotal === null;
  const pct = isUnlimited ? 0 : Math.round((slotsUsed / (slotsTotal ?? 1)) * 100);

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {isUnlimited
              ? `${slotsUsed.toLocaleString()} slots used (unlimited)`
              : `${slotsUsed.toLocaleString()} / ${slotsTotal!.toLocaleString()} slots used`}
          </Text>
          {!isUnlimited && slotsRemaining != null && (
            <Text as="span" tone="subdued" variant="bodySm">
              {slotsRemaining.toLocaleString()} remaining
            </Text>
          )}
        </InlineStack>
        {!isUnlimited && (
          <ProgressBar progress={pct} size="small" tone={pct >= 90 ? 'critical' : 'highlight'} />
        )}
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ summary, isLoading, isError, activeTotal, pushIsSyncing, vdsPhase }: {
  summary: CatalogSummary | undefined;
  isLoading: boolean;
  isError?: boolean;
  activeTotal?: number;
  pushIsSyncing?: boolean;
  vdsPhase?: boolean;
}) {
  if (isLoading && !summary) {
    return (
      <Card>
        <SkeletonBodyText lines={2} />
      </Card>
    );
  }

  // If summary failed but we have the total from the active count query, show a minimal bar
  if (!summary) {
    if ((activeTotal ?? 0) === 0) return null;
    return (
      <Card>
        <InlineStack gap="600" wrap>
          <BlockStack gap="050">
            <Text as="span" tone="subdued" variant="bodySm">Products in Shopify</Text>
            <Text as="span" fontWeight="semibold" variant="bodyMd">{(activeTotal ?? 0).toLocaleString()}</Text>
          </BlockStack>
        </InlineStack>
      </Card>
    );
  }

  // unique_product_count may not be returned by older backend versions — fall back to total_active
  const productCount = summary.unique_product_count ?? summary.total_active ?? 0;
  const variantCount = summary.total_active ?? 0;
  const vdsTier2 = summary.vds_tier2_count ?? 0;
  const vdsSingleCount = (summary.vds_count ?? 0) - vdsTier2;

  const stats: { label: string; value: string; sub?: string }[] = [
    {
      label: 'Products in Shopify',
      value: productCount.toLocaleString(),
      sub: variantCount !== productCount
        ? `${variantCount.toLocaleString()} total variants`
        : undefined,
    },
    { label: 'Warehouse', value: (summary.retail_count ?? 0).toLocaleString() },
    { label: 'Dropship — single tier', value: vdsSingleCount.toLocaleString(), sub: pushIsSyncing && vdsPhase ? 'Adding now…' : undefined },
    { label: 'Dropship — w/ Tier 2', value: vdsTier2.toLocaleString() },
    { label: 'Last sync', value: formatDateTime(summary.last_sync_at) },
  ];

  const topCategories = summary.categories?.slice(0, 8) ?? [];
  const topBrands     = summary.brands?.slice(0, 8) ?? [];
  const showBreakdown = topCategories.length > 0 || topBrands.length > 0;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack gap="600" wrap>
          {stats.map(({ label, value, sub }) => (
            <BlockStack gap="050" key={label}>
              <Text as="span" tone="subdued" variant="bodySm">{label}</Text>
              <Text as="span" fontWeight="semibold" variant="bodyMd">{value}</Text>
              {sub && <Text as="span" tone="subdued" variant="bodySm">{sub}</Text>}
            </BlockStack>
          ))}
        </InlineStack>

        {showBreakdown && (
          <>
            <Divider />
            <BlockStack gap="200">
              {topCategories.length > 0 && (
                <InlineStack gap="150" wrap blockAlign="center">
                  <Text as="span" tone="subdued" variant="bodySm">Categories:</Text>
                  {topCategories.map((c) => (
                    <Badge key={c.name} tone="info">{`${c.name} · ${c.count}`}</Badge>
                  ))}
                </InlineStack>
              )}
              {topBrands.length > 0 && (
                <InlineStack gap="150" wrap blockAlign="center">
                  <Text as="span" tone="subdued" variant="bodySm">Brands:</Text>
                  {topBrands.map((b) => (
                    <Badge key={b.name}>{`${b.name} · ${b.count}`}</Badge>
                  ))}
                </InlineStack>
              )}
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

function toSelectOptions(
  items: { name: string; count: number }[],
  placeholder: string
): { label: string; value: string }[] {
  return [
    { label: placeholder, value: '' },
    ...items.map((i) => ({ label: `${i.name} (${i.count})`, value: i.name })),
  ];
}

// ---------------------------------------------------------------------------
// Shared filter toolbar
// ---------------------------------------------------------------------------

function FilterBar({
  searchValue,
  onSearchChange,
  supplierFilter,
  onSupplierChange,
  categoryFilter,
  onCategoryChange,
  brandFilter,
  onBrandChange,
  categoryOptions,
  brandOptions,
  hasFilters,
  onClear,
}: {
  searchValue: string;
  onSearchChange: (v: string) => void;
  supplierFilter: string;
  onSupplierChange: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  brandFilter: string;
  onBrandChange: (v: string) => void;
  categoryOptions: { label: string; value: string }[];
  brandOptions: { label: string; value: string }[];
  hasFilters: boolean;
  onClear: () => void;
}) {
  const typeOptions: { label: string; value: string }[] = [
    { label: 'All types', value: ''              },
    { label: 'Warehouse', value: 'essendant'     },
    { label: 'Dropship',  value: 'essendant_vds' },
  ];

  return (
    <Box padding="400">
      <BlockStack gap="300">
        <TextField
          label="Search products"
          labelHidden
          placeholder="Search by name, AOA SKU, or UPC"
          value={searchValue}
          onChange={onSearchChange}
          clearButton
          onClearButtonClick={() => onSearchChange('')}
          autoComplete="off"
        />
        <InlineStack gap="300" blockAlign="end" wrap>
          <Box minWidth="150px">
            <Select label="Type" options={typeOptions} value={supplierFilter} onChange={onSupplierChange} />
          </Box>
          <Box minWidth="150px">
            <Select label="Category" options={categoryOptions} value={categoryFilter} onChange={onCategoryChange} />
          </Box>
          <Box minWidth="150px">
            <Select label="Brand" options={brandOptions} value={brandFilter} onChange={onBrandChange} />
          </Box>
          {hasFilters && (
            <button
              onClick={onClear}
              style={{
                background: 'none', border: 'none',
                cursor: 'pointer', padding: 0,
                color: 'var(--p-color-text-emphasis)',
                textDecoration: 'underline',
                fontSize: '0.875rem',
              }}
            >
              Clear filters
            </button>
          )}
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Tag filter definitions + components
// ---------------------------------------------------------------------------

const TAG_FILTER_GROUPS = [
  {
    label: 'Discovery',
    items: [
      { value: 'new-arrival',           label: 'New arrivals'   },
      { value: 'stock-status:preorder',  label: 'Preorder'       },
      { value: 'stock-status:limited',   label: 'Limited stock'  },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { value: 'hazmat',              label: 'Hazmat'                    },
      { value: 'prop65',              label: 'Prop 65 warning (common)'  },
      { value: 'prop65:ca-restricted', label: 'Prop 65 CA restricted'    },
      { value: 'non-returnable',      label: 'Non-returnable'            },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { value: 'marketplace:no-amazon',       label: 'No Amazon'  },
      { value: 'marketplace:prohibited',      label: 'Restricted' },
      { value: 'marketplace:authorized-only', label: 'Auth only'  },
    ],
  },
];

/** Human-readable descriptions shown in the collapsible tag legend. */
const TAG_LEGEND: Record<string, string> = {
  'new-arrival':                 'Recently added to the AOA catalog.',
  'stock-status:preorder':       'Available for pre-order but not yet in stock — ships when inventory arrives.',
  'stock-status:limited':        'Low inventory; availability may change without notice.',
  'hazmat':                      'Classified as hazardous material — may require special carrier or packaging.',
  'prop65':                      "Contains chemicals on California's Prop 65 list. Applies to ~80% of all products.",
  'prop65:ca-restricted':        'Restricted for sale in California under Prop 65.',
  'non-returnable':              'Cannot be returned once purchased.',
  'marketplace:no-amazon':       'AOA or brand policy prohibits listing this product on Amazon.',
  'marketplace:prohibited':      'General marketplace restriction — verify brand policy before listing.',
  'marketplace:authorized-only': 'Only authorized resellers may list this product. Confirm brand authorization first.',
};

function TagFilterCheckboxes({
  activeTags,
  onToggle,
  marketplaceClear,
  onMarketplaceClear,
  complianceClear,
  onComplianceClear,
}: {
  activeTags: string[];
  onToggle: (tag: string) => void;
  marketplaceClear?: boolean;
  onMarketplaceClear?: (v: boolean) => void;
  complianceClear?: boolean;
  onComplianceClear?: (v: boolean) => void;
}) {
  const [showLegend, setShowLegend] = useState(false);
  const legendBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: 'var(--p-color-text-subdued)', fontSize: '0.75rem', textDecoration: 'underline',
  };
  const allItems = TAG_FILTER_GROUPS.flatMap((g) => g.items);
  return (
    <BlockStack gap="300">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem 1.5rem' }}>
        {TAG_FILTER_GROUPS.map((group) => (
          <BlockStack key={group.label} gap="200">
            <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued">{group.label}</Text>
            <BlockStack gap="150">
              {group.label === 'Compliance' && onComplianceClear && (
                <>
                  <Checkbox
                    label="No compliance issues"
                    checked={complianceClear ?? false}
                    onChange={onComplianceClear}
                  />
                  <Divider />
                </>
              )}
              {group.label === 'Marketplace' && onMarketplaceClear && (
                <>
                  <Checkbox
                    label="No restrictions"
                    checked={marketplaceClear ?? false}
                    onChange={onMarketplaceClear}
                  />
                  <Divider />
                </>
              )}
              {group.items.map((item) => (
                <Checkbox
                  key={item.value}
                  label={item.label}
                  checked={activeTags.includes(item.value)}
                  onChange={() => onToggle(item.value)}
                />
              ))}
            </BlockStack>
          </BlockStack>
        ))}
      </div>
      <InlineStack blockAlign="center">
        <button style={legendBtn} onClick={() => setShowLegend((s) => !s)}>
          {showLegend ? '\u25b2 Hide tag descriptions' : '\u25bc What do these tags mean?'}
        </button>
      </InlineStack>
      {showLegend && (
        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
          <BlockStack gap="150">
            {Object.entries(TAG_LEGEND).map(([tag, desc]) => {
              const label = allItems.find((i) => i.value === tag)?.label ?? tag;
              return (
                <div key={tag} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.5rem', alignItems: 'start' }}>
                  <Text as="span" variant="bodySm" fontWeight="semibold">{label}</Text>
                  <Text as="span" variant="bodySm" tone="subdued">{desc}</Text>
                </div>
              );
            })}
          </BlockStack>
        </Box>
      )}
    </BlockStack>
  );
}

/** Standalone collapsible tag filter panel — used in the My Shopify Catalog tab. */
function TagFilterSection({
  activeTags,
  onToggle,
  onClearAll,
  marketplaceClear,
  onMarketplaceClear,
  complianceClear,
  onComplianceClear,
}: {
  activeTags: string[];
  onToggle: (tag: string) => void;
  onClearAll: () => void;
  marketplaceClear?: boolean;
  onMarketplaceClear?: (v: boolean) => void;
  complianceClear?: boolean;
  onComplianceClear?: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: 'var(--p-color-text-emphasis)', fontSize: '0.875rem',
  };
  const totalActive = activeTags.length + (marketplaceClear ? 1 : 0) + (complianceClear ? 1 : 0);
  return (
    <Box paddingInline="400" paddingBlock="300">
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center">
          <button style={linkBtn} onClick={() => setExpanded((e) => !e)}>
            {expanded ? '\u25b2 Tag filters' : '\u25bc Tag filters'}
          </button>
          {totalActive > 0 && <Badge tone="info">{`${totalActive} active`}</Badge>}
          {totalActive > 0 && (
            <button style={{ ...linkBtn, textDecoration: 'underline' }} onClick={onClearAll}>
              Clear
            </button>
          )}
        </InlineStack>
        {expanded && (
          <Box background="bg-surface-secondary" padding="400">
            <TagFilterCheckboxes
              activeTags={activeTags}
              onToggle={onToggle}
              marketplaceClear={marketplaceClear}
              onMarketplaceClear={onMarketplaceClear}
              complianceClear={complianceClear}
              onComplianceClear={onComplianceClear}
            />
          </Box>
        )}
      </BlockStack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Research filter panel (Available to Add tab only)
// ---------------------------------------------------------------------------

function ResearchFilterSection({
  minCost, onMinCost,
  maxCost, onMaxCost,
  minListPrice, onMinListPrice,
  maxListPrice, onMaxListPrice,
  minQty, onMinQty,
  maxQty, onMaxQty,
  minMargin, onMinMargin,
  sortBy, onSortBy,
  sortDir, onSortDir,
  activeTags, onToggleTag,
  marketplaceClear, onMarketplaceClear,
  complianceClear, onComplianceClear,
  activeCount,
  onClear,
}: {
  minCost: string;      onMinCost: (v: string) => void;
  maxCost: string;      onMaxCost: (v: string) => void;
  minListPrice: string; onMinListPrice: (v: string) => void;
  maxListPrice: string; onMaxListPrice: (v: string) => void;
  minQty: string;       onMinQty: (v: string) => void;
  maxQty: string;       onMaxQty: (v: string) => void;
  minMargin: string;    onMinMargin: (v: string) => void;
  sortBy: string;       onSortBy: (v: string) => void;
  sortDir: 'asc' | 'desc'; onSortDir: (v: 'asc' | 'desc') => void;
  activeTags: string[];    onToggleTag: (tag: string) => void;
  marketplaceClear: boolean; onMarketplaceClear: (v: boolean) => void;
  complianceClear: boolean; onComplianceClear: (v: boolean) => void;
  activeCount: number;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const marginOptions = [
    { label: 'Any margin', value: ''   },
    { label: '\u2265 10%',  value: '10' },
    { label: '\u2265 20%',  value: '20' },
    { label: '\u2265 30%',  value: '30' },
    { label: '\u2265 40%',  value: '40' },
    { label: '\u2265 50%',  value: '50' },
  ];

  const sortOptions = [
    { label: 'Default order',     value: ''           },
    { label: 'Margin %',          value: 'margin'     },
    { label: 'List price',        value: 'list_price' },
    { label: 'Cost',              value: 'merchant_cost' },
    { label: 'In-stock quantity', value: 'quantity'   },
    { label: 'Name',              value: 'name'       },
  ];

  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: 'var(--p-color-text-emphasis)', fontSize: '0.875rem',
  };

  return (
    <Box paddingInline="400" paddingBlock="300">
      <BlockStack gap="300">
        {/* Header row — always visible */}
        <InlineStack align="space-between" blockAlign="center" wrap>
          <InlineStack gap="200" blockAlign="center">
            <button style={linkBtn} onClick={() => setExpanded((e) => !e)}>
              {expanded ? '\u25b2 Research filters' : '\u25bc Research filters'}
            </button>
            {activeCount > 0 && <Badge tone="info">{`${activeCount} active`}</Badge>}
            {activeCount > 0 && (
              <button style={{ ...linkBtn, textDecoration: 'underline' }} onClick={onClear}>
                Clear
              </button>
            )}
          </InlineStack>

          <InlineStack gap="200" blockAlign="end">
            <Box minWidth="175px">
              <Select label="Sort by" options={sortOptions} value={sortBy} onChange={onSortBy} />
            </Box>
            {sortBy && (
              <Button
                variant="secondary"
                size="slim"
                onClick={() => onSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              >
                {sortDir === 'asc' ? '\u2191 Ascending' : '\u2193 Descending'}
              </Button>
            )}
          </InlineStack>
        </InlineStack>

        {/* Collapsible price / margin / stock filters */}
        {expanded && (
          <Box background="bg-surface-secondary" padding="400">
            <BlockStack gap="400">
              <Text as="p" variant="bodySm" tone="subdued">
                Filter by price and profitability to find products that fit your business goals.
                Margin is estimated using your current markup settings.
              </Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem 1.5rem', alignItems: 'start' }}>
                {/* Merchant cost range */}
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" fontWeight="semibold">Your cost</Text>
                  <InlineStack gap="150" blockAlign="center">
                    <Box minWidth="88px" maxWidth="88px">
                      <TextField
                        label="Min cost" labelHidden placeholder="$0"
                        prefix="$" type="number" min={0}
                        value={minCost} onChange={onMinCost} autoComplete="off"
                      />
                    </Box>
                    <Text as="span" tone="subdued">–</Text>
                    <Box minWidth="88px" maxWidth="88px">
                      <TextField
                        label="Max cost" labelHidden placeholder="any"
                        prefix="$" type="number" min={0}
                        value={maxCost} onChange={onMaxCost} autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                </BlockStack>

                {/* List price range */}
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" fontWeight="semibold">List price</Text>
                  <InlineStack gap="150" blockAlign="center">
                    <Box minWidth="88px" maxWidth="88px">
                      <TextField
                        label="Min list price" labelHidden placeholder="$0"
                        prefix="$" type="number" min={0}
                        value={minListPrice} onChange={onMinListPrice} autoComplete="off"
                      />
                    </Box>
                    <Text as="span" tone="subdued">–</Text>
                    <Box minWidth="88px" maxWidth="88px">
                      <TextField
                        label="Max list price" labelHidden placeholder="any"
                        prefix="$" type="number" min={0}
                        value={maxListPrice} onChange={onMaxListPrice} autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                </BlockStack>

                {/* In-stock qty range */}
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" fontWeight="semibold">In-stock qty</Text>
                  <InlineStack gap="150" blockAlign="center">
                    <Box minWidth="88px" maxWidth="88px">
                      <TextField
                        label="Min qty" labelHidden placeholder="0"
                        type="number" min={0}
                        value={minQty} onChange={onMinQty} autoComplete="off"
                      />
                    </Box>
                    <Text as="span" tone="subdued">–</Text>
                    <Box minWidth="88px" maxWidth="88px">
                      <TextField
                        label="Max qty" labelHidden placeholder="any"
                        type="number" min={0}
                        value={maxQty} onChange={onMaxQty} autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                </BlockStack>

                {/* Min margin preset */}
                <BlockStack gap="150">
                  <Text as="span" variant="bodySm" fontWeight="semibold">Min. margin</Text>
                  <Select label="Min. margin" labelHidden options={marginOptions} value={minMargin} onChange={onMinMargin} />
                </BlockStack>
              </div>
              <Divider />
              {/* Tag filters */}
              <TagFilterCheckboxes
                activeTags={activeTags}
                onToggle={onToggleTag}
                marketplaceClear={marketplaceClear}
                onMarketplaceClear={onMarketplaceClear}
                complianceClear={complianceClear}
                onComplianceClear={onComplianceClear}
              />
            </BlockStack>
          </Box>
        )}
      </BlockStack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Edit Price Modal
// ---------------------------------------------------------------------------

function EditPriceModal({
  product,
  open,
  onClose,
}: {
  product: CatalogProduct;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [priceInput, setPriceInput] = useState(product.your_price ?? product.list_price ?? '');
  const [belowMapWarning, setBelowMapWarning] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState(false);

  // Reset state when modal opens/closes or product changes
  useEffect(() => {
    if (open) {
      setPriceInput(product.your_price ?? product.list_price ?? '');
      setBelowMapWarning(null);
      setSuccessBanner(false);
    }
  }, [open, product.aoa_sku, product.your_price, product.list_price]);

  const priceMutation = useMutation({
    mutationFn: (price: number) => patchProductPrice(product.aoa_sku, price),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      if (data.below_map && data.map_price) {
        setBelowMapWarning(data.map_price);
      }
      setSuccessBanner(true);
    },
  });

  const parsedPrice = parseFloat(priceInput);
  const priceValid  = !isNaN(parsedPrice) && parsedPrice > 0;

  const errorMsg = priceMutation.error instanceof ApiError
    ? (priceMutation.error.status === 409
        ? 'Switch to manual pricing in Settings → Markup to edit prices directly.'
        : priceMutation.error.status === 404
        ? 'This SKU is not in your active catalog.'
        : priceMutation.error.message)
    : priceMutation.isError ? 'An unexpected error occurred. Please try again.' : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit price — ${product.product_name ?? product.aoa_sku}`}
      primaryAction={{
        content: 'Save price',
        loading: priceMutation.isPending,
        disabled: !priceValid || priceMutation.isPending,
        onAction: () => {
          if (priceValid) priceMutation.mutate(parsedPrice);
        },
      }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {successBanner && (
            <Banner title="Price updated — syncing to Shopify." tone="success" onDismiss={() => setSuccessBanner(false)} />
          )}
          {belowMapWarning && (
            <Banner title={`Price is below MAP ($${parseFloat(belowMapWarning).toFixed(2)})`} tone="warning">
              <Text as="p">
                The manufacturer recommends pricing at or above MAP (${parseFloat(belowMapWarning).toFixed(2)}).
                You can proceed, but this may violate the brand&apos;s pricing policy.
              </Text>
            </Banner>
          )}
          {errorMsg && (
            <Banner title="Could not update price" tone="critical">
              <Text as="p">{errorMsg}</Text>
            </Banner>
          )}
          {product.map_price && (
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" tone="subdued" variant="bodySm">MAP price:</Text>
              <Text as="span" fontWeight="medium" variant="bodySm">${parseFloat(product.map_price).toFixed(2)}</Text>
            </InlineStack>
          )}
          <TextField
            label="Your price (USD)"
            type="number"
            prefix="$"
            value={priceInput}
            onChange={setPriceInput}
            min={0.01}
            step={0.01}
            autoComplete="off"
            error={priceInput !== '' && !priceValid ? 'Enter a valid price greater than $0' : undefined}
          />
          {product.merchant_cost && (
            <Text as="p" tone="subdued" variant="bodySm">
              Your cost: {formatPrice(product.merchant_cost)}
            </Text>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared product row
// ---------------------------------------------------------------------------

const supplierLabel = (t: CatalogProduct['product_type']) =>
  t === 'retail' ? 'Warehouse' : t === 'vds' ? 'Dropship' : null;
const supplierTone = (t: CatalogProduct['product_type']) =>
  t === 'retail' ? ('info' as const) : t === 'vds' ? ('warning' as const) : undefined;

function ProductRow({
  product,
  rowId,
  index,
  selected,
  actionButton,
  detailUrl,
  showEditPrice,
  showMapPrice,
  showYourPrice,
}: {
  product: CatalogProduct;
  rowId: string;
  index: number;
  selected: boolean;
  actionButton?: React.ReactNode;
  /** When provided, the product name becomes a link to the detail page */
  detailUrl?: string;
  /** When true, shows an Edit Price button (manual pricing mode) */
  showEditPrice?: boolean;
  /** When true, shows MAP sub-text and below-MAP badge under list price */
  showMapPrice?: boolean;
  /** When true, shows a Your Price column cell (active catalog only) */
  showYourPrice?: boolean;
}) {
  const status = product.last_shopify_status?.toUpperCase() ?? null;
  const [editPriceOpen, setEditPriceOpen] = useState(false);

  return (
    <>
      <IndexTable.Row id={rowId} key={rowId} position={index} selected={selected}>
        <IndexTable.Cell>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.product_name ?? product.aoa_sku}
              style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, background: '#f6f6f7' }}
            />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 4, background: '#f6f6f7' }} />
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            {detailUrl ? (
              <span onClick={(e) => e.stopPropagation()}>
                <Link url={detailUrl} removeUnderline>
                  <Text fontWeight="semibold" as="span">{product.product_name ?? '—'}</Text>
                </Link>
              </span>
            ) : (
              <Text fontWeight="semibold" as="span">{product.product_name ?? '—'}</Text>
            )}
            <InlineStack gap="100" blockAlign="center">
              <Text tone="subdued" variant="bodySm" as="span">AOA SKU: {product.aoa_sku}</Text>
              {product.variant_tier != null && product.variant_tier > 1 && (
                <Badge tone="info" size="small">{`Qty ×${product.variant_tier}`}</Badge>
              )}
            </InlineStack>
            <ProductTagBadges tags={product.tags} />
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {supplierLabel(product.product_type) ? (
            <Badge tone={supplierTone(product.product_type)}>
              {supplierLabel(product.product_type)!}
            </Badge>
          ) : (
            <Text as="span" tone="subdued">—</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell><Text as="span">{product.category_1 ?? '—'}</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span">{product.brand ?? '—'}</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span">{formatPrice(product.merchant_cost)}</Text></IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span">{formatPrice(product.list_price)}</Text>
            {showMapPrice && product.map_price && (
              <Text as="span" tone="subdued" variant="bodySm">MAP: {formatPrice(product.map_price)}</Text>
            )}
            {showMapPrice && product.below_map && (
              <Badge tone="warning" size="small">⚠ Below MAP</Badge>
            )}
          </BlockStack>
        </IndexTable.Cell>
        {showYourPrice && (
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">
                {product.your_price
                  ? formatPrice(product.your_price)
                  : showEditPrice
                    ? <Text as="span" tone="subdued">— Set price</Text>
                    : formatPrice(product.list_price)}
              </Text>
              {showEditPrice && (
                <span onClick={(e) => e.stopPropagation()}>
                  <Button size="slim" variant="plain" onClick={() => setEditPriceOpen(true)}>
                    Edit
                  </Button>
                </span>
              )}
            </BlockStack>
          </IndexTable.Cell>
        )}
        <IndexTable.Cell><Text as="span">{(product.catalog_quantity ?? product.last_synced_quantity) != null ? (product.catalog_quantity ?? product.last_synced_quantity)!.toLocaleString() : '—'}</Text></IndexTable.Cell>
        <IndexTable.Cell>
          {status && status !== 'UNKNOWN' ? (
            <Badge tone={status === 'ACTIVE' ? 'success' : status === 'DRAFT' ? 'attention' : undefined}>
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </Badge>
          ) : product.in_shopify ? (
            <Badge tone="success">In Shopify</Badge>
          ) : (
            <Badge tone="new">Not pushed</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {actionButton}
        </IndexTable.Cell>
      </IndexTable.Row>
      {showEditPrice && (
        <EditPriceModal
          product={product}
          open={editPriceOpen}
          onClose={() => setEditPriceOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared type + helpers for grouped (quantity-tier) rows
// ---------------------------------------------------------------------------

type RowProduct = CatalogProduct & { _rowId: string; [key: string]: unknown };

/** Group a flat product list by aoa_sku. Any group with >1 item = quantity-tier pricing. */
function groupBySkuWithTiers(products: RowProduct[]): RowProduct[][] {
  const map = new Map<string, RowProduct[]>();
  for (const p of products) {
    const g = map.get(p.aoa_sku);
    if (g) g.push(p); else map.set(p.aoa_sku, [p]);
  }
  return Array.from(map.values());
}

/**
 * Renders a quantity-tier SKU group as an expandable set of IndexTable rows.
 * The header row shows product meta + a toggle; child rows reveal per-tier
 * cost/price details when expanded.
 */
function ProductGroupRows({
  group,
  startIndex,
  selectedResources,
  isExpanded,
  onToggle,
  actionButton,
  detailUrl,
  showEditPrice,
  showMapPrice,
  showYourPrice,
}: {
  group: RowProduct[];
  startIndex: number;
  selectedResources: string[];
  isExpanded: boolean;
  onToggle: () => void;
  actionButton?: React.ReactNode;
  /** When provided, the product name becomes a link to the detail page */
  detailUrl?: string;
  /** When true, shows an Edit Price button (manual pricing mode) */
  showEditPrice?: boolean;
  /** When true, shows MAP sub-text and below-MAP badge under list price */
  showMapPrice?: boolean;
  /** When true, shows a Your Price column cell (active catalog only) */
  showYourPrice?: boolean;
}) {
  const first = group[0];
  const count = group.length;
  const status = first.last_shopify_status?.toUpperCase() ?? null;
  const [editPriceOpen, setEditPriceOpen] = useState(false);

  const toggleStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: 'var(--p-color-text-emphasis)', fontSize: '0.75rem', lineHeight: 1,
  };

  return (
    <>
      {/* Header row — one checkbox covers the whole group */}
      <IndexTable.Row id={first._rowId} position={startIndex} selected={selectedResources.includes(first._rowId)}>
        <IndexTable.Cell>
          {first.image_url ? (
            <img
              src={first.image_url}
              alt={first.product_name ?? first.aoa_sku}
              style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, background: '#f6f6f7' }}
            />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 4, background: '#f6f6f7' }} />
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            {detailUrl ? (
              <span onClick={(e) => e.stopPropagation()}>
                <Link url={detailUrl} removeUnderline>
                  <Text fontWeight="semibold" as="span">{first.product_name ?? '\u2014'}</Text>
                </Link>
              </span>
            ) : (
              <Text fontWeight="semibold" as="span">{first.product_name ?? '\u2014'}</Text>
            )}
            <InlineStack gap="100" blockAlign="center">
              <Text tone="subdued" variant="bodySm" as="span">AOA SKU: {first.aoa_sku}</Text>
              <Badge tone="attention" size="small">{`${count} price tiers`}</Badge>
              <button style={toggleStyle} onClick={onToggle}>
                {isExpanded ? '\u25b2 hide' : '\u25bc expand'}
              </button>
            </InlineStack>
            <ProductTagBadges tags={first.tags} />
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {supplierLabel(first.product_type) ? (
            <Badge tone={supplierTone(first.product_type)}>
              {supplierLabel(first.product_type)!}
            </Badge>
          ) : <Text as="span" tone="subdued">\u2014</Text>}
        </IndexTable.Cell>
        <IndexTable.Cell><Text as="span">{first.category_1 ?? '\u2014'}</Text></IndexTable.Cell>
        <IndexTable.Cell><Text as="span">{first.brand ?? '\u2014'}</Text></IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" tone="subdued">
            {isExpanded ? 'See tiers' : `$${Math.min(...group.map(p => parseFloat(p.merchant_cost ?? '0') || 0)).toFixed(2)}\u2009\u2013\u2009$${Math.max(...group.map(p => parseFloat(p.merchant_cost ?? '0') || 0)).toFixed(2)}`}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" tone="subdued">
              {isExpanded ? 'See tiers' : `$${Math.min(...group.map(p => parseFloat(p.list_price ?? '0') || 0)).toFixed(2)}\u2009\u2013\u2009$${Math.max(...group.map(p => parseFloat(p.list_price ?? '0') || 0)).toFixed(2)}`}
            </Text>
            {showMapPrice && first.map_price && !isExpanded && (
              <Text as="span" tone="subdued" variant="bodySm">MAP: {formatPrice(first.map_price)}</Text>
            )}
            {showMapPrice && first.below_map && !isExpanded && (
              <Badge tone="warning" size="small">⚠ Below MAP</Badge>
            )}
          </BlockStack>
        </IndexTable.Cell>
        {showYourPrice && (
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">
                {isExpanded
                  ? 'See tiers'
                  : first.your_price
                    ? formatPrice(first.your_price)
                    : showEditPrice
                      ? <Text as="span" tone="subdued">— Set price</Text>
                      : formatPrice(first.list_price)}
              </Text>
              {showEditPrice && !isExpanded && (
                <span onClick={(e) => e.stopPropagation()}>
                  <Button size="slim" variant="plain" onClick={() => setEditPriceOpen(true)}>
                    Edit
                  </Button>
                </span>
              )}
            </BlockStack>
          </IndexTable.Cell>
        )}
        <IndexTable.Cell><Text as="span">{(first.catalog_quantity ?? first.last_synced_quantity) != null ? (first.catalog_quantity ?? first.last_synced_quantity)!.toLocaleString() : '\u2014'}</Text></IndexTable.Cell>
        <IndexTable.Cell>
          {status && status !== 'UNKNOWN' ? (
            <Badge tone={status === 'ACTIVE' ? 'success' : status === 'DRAFT' ? 'attention' : undefined}>
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </Badge>
          ) : first.in_shopify ? (
            <Badge tone="success">In Shopify</Badge>
          ) : (
            <Badge tone="new">Not pushed</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {actionButton}
        </IndexTable.Cell>
      </IndexTable.Row>

      {/* Tier child rows — only rendered when expanded */}
      {isExpanded && group.map((product, i) => (
        <IndexTable.Row
          key={product._rowId}
          id={product._rowId}
          position={startIndex + 1 + i}
          selected={selectedResources.includes(product._rowId)}
          tone="subdued"
        >
          <IndexTable.Cell />
          <IndexTable.Cell>
            <Box paddingInlineStart="600">
              <InlineStack gap="100" blockAlign="center">
                <Text tone="subdued" variant="bodySm" as="span">
                  {product.variant_tier != null && product.variant_tier > 1
                    ? `Min qty: ${product.variant_tier}`
                    : `Tier ${i + 1}`}
                </Text>
                {product.variant_tier != null && product.variant_tier > 1 && (
                  <Badge tone="info" size="small">{`Qty \u00d7${product.variant_tier}`}</Badge>
                )}
              </InlineStack>
            </Box>
          </IndexTable.Cell>
          <IndexTable.Cell />
          <IndexTable.Cell />
          <IndexTable.Cell />
          <IndexTable.Cell><Text as="span">{formatPrice(product.merchant_cost)}</Text></IndexTable.Cell>
          <IndexTable.Cell><Text as="span">{formatPrice(product.list_price)}</Text></IndexTable.Cell>
          {showYourPrice && <IndexTable.Cell><Text as="span" tone="subdued">{formatPrice(product.your_price ?? product.list_price)}</Text></IndexTable.Cell>}
          <IndexTable.Cell><Text as="span">{product.catalog_quantity ?? '\u2014'}</Text></IndexTable.Cell>
          <IndexTable.Cell />
          <IndexTable.Cell />
        </IndexTable.Row>
      ))}

      {showEditPrice && (
        <EditPriceModal
          product={first}
          open={editPriceOpen}
          onClose={() => setEditPriceOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// "My Shopify Catalog" tab  (status=active)
// ---------------------------------------------------------------------------

function ActiveCatalogTab({
  summary,
  summaryLoading,
  summaryError,
  activeTotal,
  startRemoveAll,
  isRemovingAll,
  pushIsSyncing,
  vdsPhase,
}: {
  summary: CatalogSummary | undefined;
  summaryLoading: boolean;
  summaryError: boolean;
  activeTotal: number;
  startRemoveAll: () => void;
  isRemovingAll: boolean;
  pushIsSyncing: boolean;
  vdsPhase: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [tagFilters,  setTagFilters]  = useState<string[]>([]);
  const [marketplaceClear, setMarketplaceClear] = useState(false);
  const [showRemoveAllModal, setShowRemoveAllModal] = useState(false);

  // Fetch settings to determine manual vs auto pricing mode
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  });
  const isManualPricing = settings?.use_auto_pricing === false;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchValue); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchValue]);

  const handleSupplier  = useCallback((v: string) => { setSupplierFilter(v); setPage(1); }, []);
  const handleCategory  = useCallback((v: string) => { setCategoryFilter(v); setPage(1); }, []);
  const handleBrand     = useCallback((v: string) => { setBrandFilter(v);    setPage(1); }, []);
  const handleToggleTag = useCallback((tag: string) => {
    setTagFilters((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
    setPage(1);
  }, []);
  const clearFilters = () => {
    setSearchValue(''); setDebouncedSearch('');
    setSupplierFilter(''); setCategoryFilter(''); setBrandFilter('');
    setTagFilters([]); setMarketplaceClear(false);
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['catalog', 'active', page, debouncedSearch, supplierFilter, categoryFilter, brandFilter, [...tagFilters].sort().join(','), marketplaceClear],
    queryFn: () => getCatalog({
      status: 'active', page, page_size: PAGE_SIZE,
      search:            debouncedSearch || undefined,
      supplier:          supplierFilter  || undefined,
      category:          categoryFilter  || undefined,
      brand:             brandFilter     || undefined,
      tags:              tagFilters.length > 0 ? tagFilters : undefined,
      marketplace_clear: marketplaceClear || undefined,
    }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const products = data?.items ?? data?.products ?? [];
  const pages    = data?.pages ?? 1;

  const rowProducts: RowProduct[] = products.map((p, i) => ({
    ...p,
    _rowId: `active-${(page - 1) * PAGE_SIZE + i}`,
  }));

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rowProducts, { resourceIDResolver: (p) => p._rowId });

  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((sku: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (handleSelectionChange as (t: string, s: boolean) => void)('all', false);
    setExpandedSkus(new Set());
  }, [page, debouncedSearch, supplierFilter, categoryFilter, brandFilter, tagFilters]);

  const removeMutation = useMutation({
    mutationFn: (req: RemoveCatalogRequest) => removeCatalog(req),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['catalog'] }); },
  });

  const hasFilters = Boolean(debouncedSearch || supplierFilter || categoryFilter || brandFilter || tagFilters.length > 0);
  const categoryOptions = toSelectOptions(summary?.categories ?? [], 'All categories');
  const brandOptions    = toSelectOptions(summary?.brands     ?? [], 'All brands');

  const selectedSkus = [...new Set(
    selectedResources
      .map((rowId) => rowProducts.find((p) => p._rowId === rowId)?.aoa_sku)
      .filter((sku): sku is string => sku !== undefined)
  )];

  const headings = [
    { title: '' }, { title: 'Product' }, { title: 'Type' }, { title: 'Category' }, { title: 'Brand' },
    { title: 'Cost' }, { title: 'List price' }, { title: 'Your price' }, { title: 'Qty' }, { title: 'Status' }, { title: 'Action' },
  ] as [{ title: string }, ...{ title: string }[]];

  return (
    <BlockStack gap="400">
      {isManualPricing && (
        <Banner title="Manual pricing mode" tone="info">
          <Text as="p">
            Auto-pricing is off. Use the <strong>Edit price</strong> button on any row to set a custom price.
            To switch back to markup-based pricing, go to <strong>Settings → Markup</strong>.
          </Text>
        </Banner>
      )}

      {/* data.total is the most reliable source — it's loaded when products are visible */}
      <SummaryBar summary={summary} isLoading={summaryLoading} isError={summaryError} activeTotal={data?.total ?? activeTotal} pushIsSyncing={pushIsSyncing} vdsPhase={vdsPhase} />

      {data && (
        <SlotCounter
          slotsUsed={data.slots_used}
          slotsTotal={data.slots_total}
          slotsRemaining={data.slots_remaining}
        />
      )}

      {isError && (
        <Banner title="Could not load products" tone="critical" action={{ content: 'Retry', onAction: refetch }}>
          <Text as="p">{(error as Error)?.message || 'An unexpected error occurred.'}</Text>
        </Banner>
      )}

      {removeMutation.isError && (
        <Banner title="Could not remove products" tone="critical" onDismiss={() => removeMutation.reset()}>
          <Text as="p">
            {removeMutation.error instanceof ApiError
              ? removeMutation.error.message
              : 'An unexpected error occurred. Please try again.'}
          </Text>
        </Banner>
      )}

      {removeMutation.isSuccess && !removeMutation.data.job_started && (
        <Banner
          title={`${removeMutation.data.removed ?? 0} product${(removeMutation.data.removed ?? 0) !== 1 ? 's' : ''} removed`}
          tone="success"
          onDismiss={() => removeMutation.reset()}
        >
          <Text as="p">{`${removeMutation.data.slots_remaining ?? '—'} slots remaining.`}</Text>
        </Banner>
      )}

      <Card padding="0">
        <FilterBar
          searchValue={searchValue}
          onSearchChange={(v) => setSearchValue(v)}
          supplierFilter={supplierFilter}
          onSupplierChange={handleSupplier}
          categoryFilter={categoryFilter}
          onCategoryChange={handleCategory}
          brandFilter={brandFilter}
          onBrandChange={handleBrand}
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
          hasFilters={hasFilters}
          onClear={clearFilters}
        />

        <Divider />
        <TagFilterSection
          activeTags={tagFilters}
          onToggle={handleToggleTag}
          onClearAll={() => { setTagFilters([]); setMarketplaceClear(false); setPage(1); }}
          marketplaceClear={marketplaceClear}
          onMarketplaceClear={(v) => { setMarketplaceClear(v); setPage(1); }}
        />

        <Box padding="400" paddingBlockStart="0">
          <InlineStack align="space-between" blockAlign="center">
            {selectedResources.length > 0 ? (
              <InlineStack gap="300" blockAlign="center">
                <Text as="span" tone="subdued" variant="bodySm">{selectedResources.length} selected</Text>
                <Button
                  tone="critical"
                  variant="plain"
                  loading={removeMutation.isPending}
                  onClick={() => removeMutation.mutate({ skus: selectedSkus })}
                >
                  Remove from Shopify
                </Button>
              </InlineStack>
            ) : <span />}
            {data && data.total > 0 && (
              <Button tone="critical" variant="plain" disabled={isRemovingAll} onClick={() => setShowRemoveAllModal(true)}>
                Remove all ({data.total.toLocaleString()}) from Shopify…
              </Button>
            )}
          </InlineStack>
        </Box>

        <Divider />

        {isError ? null : !isLoading && !isFetching && products.length === 0 ? (
          <Box paddingBlockStart="600" paddingBlockEnd="600">
            <EmptyState
              heading={hasFilters ? 'No products match your filters' : 'No products in Shopify yet'}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <Text as="p">
                {hasFilters
                  ? 'Try adjusting your search or removing filters.'
                  : 'Add products from the "Available to Add" tab.'}
              </Text>
            </EmptyState>
          </Box>
        ) : (
          <IndexTable
            resourceName={{ singular: 'product', plural: 'products' }}
            itemCount={rowProducts.length}
            headings={headings}
            selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            loading={isFetching}
          >
            {(() => {
              let pos = 0;
              return groupBySkuWithTiers(rowProducts).map((group) => {
                const key = group[0]._rowId;
                const removeBtn = (
                  <Button size="slim" tone="critical" variant="plain" loading={removeMutation.isPending}
                    onClick={() => removeMutation.mutate({ skus: [group[0].aoa_sku] })}>
                    Remove
                  </Button>
                );
                if (group.length === 1) {
                  const el = (
                    <ProductRow key={key} product={group[0]} rowId={key} index={pos}
                      selected={selectedResources.includes(key)} actionButton={removeBtn}
                      detailUrl={`/products/${encodeURIComponent(group[0].aoa_sku)}`}
                      showEditPrice={isManualPricing}
                      showMapPrice
                      showYourPrice />
                  );
                  pos += 1;
                  return el;
                }
                const expanded = expandedSkus.has(group[0].aoa_sku);
                const el = (
                  <ProductGroupRows key={key} group={group} startIndex={pos}
                    selectedResources={selectedResources} isExpanded={expanded}
                    onToggle={() => toggleExpand(group[0].aoa_sku)} actionButton={removeBtn}
                    detailUrl={`/products/${encodeURIComponent(group[0].aoa_sku)}`}
                    showEditPrice={isManualPricing}
                    showMapPrice
                    showYourPrice />
                );
                pos += expanded ? 1 + group.length : 1;
                return el;
              });
            })()}
          </IndexTable>
        )}
      </Card>

      {pages > 1 && (
        <InlineStack align="center" gap="200" blockAlign="center">
          {isFetching && <Spinner size="small" />}
          <Pagination
            hasPrevious={page > 1}
            onPrevious={() => setPage((p) => p - 1)}
            hasNext={page < pages}
            onNext={() => setPage((p) => p + 1)}
            label={`Page ${page} of ${pages}`}
          />
        </InlineStack>
      )}

      <Modal
        open={showRemoveAllModal}
        onClose={() => setShowRemoveAllModal(false)}
        title="Remove all products from Shopify?"
        primaryAction={{
          content: `Remove all${data?.total != null ? ` (${data.total.toLocaleString()})` : ''} products`,
          onAction: () => {
            setShowRemoveAllModal(false);
            startRemoveAll();
          },
          destructive: true,
          loading: isRemovingAll,
          disabled: isRemovingAll,
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setShowRemoveAllModal(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            {`This will remove ${data?.total != null ? `all ${data.total.toLocaleString()} products` : 'all products'} from your Shopify store. They will return to the Available to Add pool and can be re-pushed at any time.`}
          </Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// "Available to Add" tab  (status=available)
// ---------------------------------------------------------------------------

function AvailableCatalogTab({
  summary,
  showPushAllBanner,
  onDismissPushAllBanner,
  isInWatchlist,
  onToggleWatchlist,
  pushAllIsSyncing,
  pushAllIsPending,
  pushAllError,
  onTriggerPushAll,
  onClearPushAllError,
}: {
  summary: CatalogSummary | undefined;
  showPushAllBanner?: boolean;
  onDismissPushAllBanner?: () => void;
  isInWatchlist: (sku: string) => boolean;
  onToggleWatchlist: (entry: Omit<WatchlistEntry, 'added_at'>) => void;
  /** True while push_all HTTP request is in flight or 202 job is polling */
  pushAllIsSyncing: boolean;
  pushAllIsPending: boolean;
  pushAllError: string | null;
  onTriggerPushAll: () => void;
  onClearPushAllError: () => void;
}) {
  const queryClient = useQueryClient();

  // ── Read initial filter state from URL (preserves state on browser back) ──
  const readUrl = (): URLSearchParams => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  };

  const [page, setPage] = useState(() => parseInt(readUrl().get('page') ?? '1', 10) || 1);
  const [searchValue, setSearchValue] = useState(() => readUrl().get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => readUrl().get('search') ?? '');
  const [supplierFilter, setSupplierFilter] = useState(() => readUrl().get('supplier') ?? '');
  const [categoryFilter, setCategoryFilter] = useState(() => readUrl().get('category') ?? '');
  const [brandFilter, setBrandFilter] = useState(() => readUrl().get('brand') ?? '');
  const [pushError, setPushError] = useState<string | null>(null);

  // Research filters — also restored from URL on mount
  const [minCost, setMinCost] = useState(() => readUrl().get('min_cost') ?? '');
  const [maxCost, setMaxCost] = useState(() => readUrl().get('max_cost') ?? '');
  const [minListPrice, setMinListPrice] = useState(() => readUrl().get('min_list') ?? '');
  const [maxListPrice, setMaxListPrice] = useState(() => readUrl().get('max_list') ?? '');
  const [minQty, setMinQty] = useState(() => readUrl().get('min_qty') ?? '');
  const [maxQty, setMaxQty] = useState(() => readUrl().get('max_qty') ?? '');
  const [minMargin, setMinMargin] = useState(() => readUrl().get('min_margin') ?? '');
  const [noCompliance, setNoCompliance] = useState(() => readUrl().get('no_compliance') === 'true');
  const [sortBy, setSortBy] = useState(() => readUrl().get('sort_by') ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (readUrl().get('sort_dir') ?? 'desc') as 'asc' | 'desc');
  const [tagFilters, setTagFilters] = useState<string[]>(() => {
    const tags = readUrl().get('tags');
    return tags ? tags.split(',').filter(Boolean) : [];
  });
  const [marketplaceClear, setMarketplaceClear] = useState(() => readUrl().get('mkt_clear') === 'true');

  // Debounced price/qty fields — initialised from URL directly (no debounce on first load)
  const [dMinCost, setDMinCost] = useState(() => readUrl().get('min_cost') ?? '');
  const [dMaxCost, setDMaxCost] = useState(() => readUrl().get('max_cost') ?? '');
  const [dMinList, setDMinList] = useState(() => readUrl().get('min_list') ?? '');
  const [dMaxList, setDMaxList] = useState(() => readUrl().get('max_list') ?? '');
  const [dMinQty, setDMinQty] = useState(() => readUrl().get('min_qty') ?? '');
  const [dMaxQty, setDMaxQty] = useState(() => readUrl().get('max_qty') ?? '');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchValue); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchValue]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDMinCost(minCost); setDMaxCost(maxCost);
      setDMinList(minListPrice); setDMaxList(maxListPrice);
      setDMinQty(minQty); setDMaxQty(maxQty);
      setPage(1);
    }, 600);
    return () => clearTimeout(t);
  }, [minCost, maxCost, minListPrice, maxListPrice, minQty, maxQty]);

  // ── Sync all filter state → URL (replaceState so browser Back restores it) ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    sp.set('tab', 'available');
    if (searchValue)         sp.set('search',     searchValue);     else sp.delete('search');
    if (supplierFilter)      sp.set('supplier',   supplierFilter);  else sp.delete('supplier');
    if (categoryFilter)      sp.set('category',   categoryFilter);  else sp.delete('category');
    if (brandFilter)         sp.set('brand',      brandFilter);     else sp.delete('brand');
    if (minCost)             sp.set('min_cost',   minCost);         else sp.delete('min_cost');
    if (maxCost)             sp.set('max_cost',   maxCost);         else sp.delete('max_cost');
    if (minListPrice)        sp.set('min_list',   minListPrice);    else sp.delete('min_list');
    if (maxListPrice)        sp.set('max_list',   maxListPrice);    else sp.delete('max_list');
    if (minQty)              sp.set('min_qty',    minQty);          else sp.delete('min_qty');
    if (maxQty)              sp.set('max_qty',    maxQty);          else sp.delete('max_qty');
    if (minMargin)           sp.set('min_margin', minMargin);       else sp.delete('min_margin');
    if (noCompliance)        sp.set('no_compliance', 'true');        else sp.delete('no_compliance');
    if (sortBy)              sp.set('sort_by',    sortBy);          else sp.delete('sort_by');
    if (sortBy)              sp.set('sort_dir',   sortDir);         else sp.delete('sort_dir');
    if (tagFilters.length)   sp.set('tags',       tagFilters.join(','));  else sp.delete('tags');
    if (marketplaceClear)    sp.set('mkt_clear',  'true');          else sp.delete('mkt_clear');
    if (page > 1)            sp.set('page',       String(page));    else sp.delete('page');
    window.history.replaceState({}, '', url.toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchValue, supplierFilter, categoryFilter, brandFilter,
      minCost, maxCost, minListPrice, maxListPrice, minQty, maxQty,
      minMargin, noCompliance, sortBy, sortDir, tagFilters, marketplaceClear]);

  const handleSupplier  = useCallback((v: string)       => { setSupplierFilter(v); setPage(1); }, []);
  const handleCategory  = useCallback((v: string)       => { setCategoryFilter(v); setPage(1); }, []);
  const handleBrand     = useCallback((v: string)       => { setBrandFilter(v);    setPage(1); }, []);
  const handleMinMargin    = useCallback((v: string)       => { setMinMargin(v);      setPage(1); }, []);
  const handleNoCompliance = useCallback((v: boolean)      => { setNoCompliance(v);   setPage(1); }, []);
  const handleSortBy       = useCallback((v: string)       => { setSortBy(v);         setPage(1); }, []);
  const handleSortDir   = useCallback((v: 'asc'|'desc') => setSortDir(v), []);
  const handleToggleTag = useCallback((tag: string) => {
    setTagFilters((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
    setPage(1);
  }, []);

  const clearFilters = () => {
    setSearchValue(''); setDebouncedSearch('');
    setSupplierFilter(''); setCategoryFilter(''); setBrandFilter('');
    setPage(1);
  };

  const clearResearchFilters = () => {
    setMinCost(''); setMaxCost(''); setDMinCost(''); setDMaxCost('');
    setMinListPrice(''); setMaxListPrice(''); setDMinList(''); setDMaxList('');
    setMinQty(''); setMaxQty(''); setDMinQty(''); setDMaxQty('');
    setMinMargin(''); setNoCompliance(false); setTagFilters([]); setMarketplaceClear(false);
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: [
      'catalog', 'available', page,
      debouncedSearch, supplierFilter, categoryFilter, brandFilter,
      dMinCost, dMaxCost, dMinList, dMaxList, dMinQty, dMaxQty,
      minMargin, noCompliance, sortBy, sortDir,
      [...tagFilters].sort().join(','), marketplaceClear,
    ],
    queryFn: () => getCatalog({
      status: 'available', page, page_size: PAGE_SIZE,
      search:            debouncedSearch || undefined,
      supplier:          supplierFilter  || undefined,
      category:          categoryFilter  || undefined,
      brand:             brandFilter     || undefined,
      min_cost:          dMinCost        ? parseFloat(dMinCost)    : undefined,
      max_cost:          dMaxCost        ? parseFloat(dMaxCost)    : undefined,
      min_list_price:    dMinList        ? parseFloat(dMinList)    : undefined,
      max_list_price:    dMaxList        ? parseFloat(dMaxList)    : undefined,
      min_qty:           dMinQty         ? parseInt(dMinQty, 10)   : undefined,
      max_qty:           dMaxQty         ? parseInt(dMaxQty, 10)   : undefined,
      min_margin:        minMargin       ? parseInt(minMargin, 10) : undefined,
      sort_by:           (sortBy as CatalogParams['sort_by']) || undefined,
      sort_dir:          sortBy          ? sortDir : undefined,
      tags:              tagFilters.length > 0 ? tagFilters : undefined,
      marketplace_clear: marketplaceClear || undefined,
      compliance_clear:  noCompliance    || undefined,
    }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const products = data?.items ?? data?.products ?? [];
  const pages    = data?.pages ?? 1;

  const rowProducts: RowProduct[] = products.map((p, i) => ({
    ...p,
    _rowId: `avail-${(page - 1) * PAGE_SIZE + i}`,
  }));

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rowProducts, { resourceIDResolver: (p) => p._rowId });

  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((sku: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (handleSelectionChange as (t: string, s: boolean) => void)('all', false);
    setExpandedSkus(new Set());
  }, [page, debouncedSearch, supplierFilter, categoryFilter, brandFilter,
      dMinCost, dMaxCost, dMinList, dMaxList, dMinQty, dMaxQty,
      minMargin, noCompliance, sortBy, sortDir, tagFilters, marketplaceClear]);

  const pushMutation = useMutation({
    mutationFn: (skus: string[]) => pushCatalog({ skus }),
    onSuccess: () => {
      setPushError(null);
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setPushError('Too many requests — please wait a minute before adding more products.');
          return;
        }
        const detail = parsePlanLimitDetail(err);
        if (detail) {
          setPushError(
            `You only have ${detail.slots_remaining} slot${detail.slots_remaining !== 1 ? 's' : ''} remaining. ` +
            `Select up to ${detail.slots_remaining} product${detail.slots_remaining !== 1 ? 's' : ''} or upgrade your plan.`
          );
          return;
        }
      }
      setPushError(null);
    },
  });

  const hasBasicFilters    = Boolean(debouncedSearch || supplierFilter || categoryFilter || brandFilter);
  const researchActiveCount = [dMinCost, dMaxCost, dMinList, dMaxList, dMinQty, dMaxQty, minMargin]
    .filter(Boolean).length + (noCompliance ? 1 : 0) + (marketplaceClear ? 1 : 0) + tagFilters.length;
  const hasFilters = hasBasicFilters || researchActiveCount > 0 || Boolean(sortBy);

  const categoryOptions = toSelectOptions(data?.categories ?? [], 'All categories');
  const brandOptions    = toSelectOptions(data?.brands     ?? [], 'All brands');

  const selectedSkus = [...new Set(
    selectedResources
      .map((rowId) => rowProducts.find((p) => p._rowId === rowId)?.aoa_sku)
      .filter((sku): sku is string => sku !== undefined)
  )];

  const headings = [
    { title: '' }, { title: 'Product' }, { title: 'Type' }, { title: 'Category' }, { title: 'Brand' },
    { title: 'Cost' }, { title: 'List price' }, { title: 'Qty' }, { title: 'Status' }, { title: 'Action' },
  ] as [{ title: string }, ...{ title: string }[]];

  const showPushError = pushError !== null || (pushMutation.isError && !pushError);
  const atLimit = data != null && data.slots_remaining === 0;

  // Slots info for push_all banner — use data if loaded, otherwise fall back to null
  const slotsRemaining = data?.slots_remaining ?? null;
  const noSlotsLeft = slotsRemaining === 0;

  return (
    <BlockStack gap="400">
      {/* Push-all idle confirmation banner (progress shown at page level) */}
      {showPushAllBanner && !noSlotsLeft && !pushAllIsSyncing && (
        <Banner
          title="Ready to add available products to your Shopify store"
          tone="info"
          onDismiss={onDismissPushAllBanner}
        >
          <BlockStack gap="300">
            {slotsRemaining != null && (
              <Text as="p" tone="subdued">
                {slotsRemaining.toLocaleString()} slot{slotsRemaining !== 1 ? 's' : ''} remaining on your plan.
              </Text>
            )}
            {pushAllError && (
              <Text as="p" tone="critical">{pushAllError}</Text>
            )}
            <InlineStack gap="300">
              <Button
                variant="primary"
                loading={pushAllIsPending}
                disabled={pushAllIsPending || pushAllIsSyncing}
                onClick={() => { onDismissPushAllBanner?.(); onClearPushAllError(); onTriggerPushAll(); }}
              >
                Add All Available Products
              </Button>
              <Button variant="secondary" onClick={onDismissPushAllBanner}>
                Cancel
              </Button>
            </InlineStack>
          </BlockStack>
        </Banner>
      )}

      {/* No slots left */}
      {showPushAllBanner && noSlotsLeft && (
        <Banner
          title="No slots remaining on your plan"
          tone="warning"
          onDismiss={onDismissPushAllBanner}
        >
          <Text as="p">
            Upgrade your plan to add more products, or remove existing products from the
            <strong> My Shopify Catalog</strong> tab to free up slots.
          </Text>
        </Banner>
      )}

      {data && (
        <SlotCounter
          slotsUsed={data.slots_used}
          slotsTotal={data.slots_total}
          slotsRemaining={data.slots_remaining}
        />
      )}

      {isError && (
        <Banner title="Could not load products" tone="critical" action={{ content: 'Retry', onAction: refetch }}>
          <Text as="p">{(error as Error)?.message || 'An unexpected error occurred.'}</Text>
        </Banner>
      )}

      {showPushError && (
        <Banner
          title="Could not add products"
          tone="critical"
          onDismiss={() => { setPushError(null); pushMutation.reset(); }}
        >
          <Text as="p">
            {pushError ?? (
              pushMutation.error instanceof ApiError
                ? pushMutation.error.message
                : 'An unexpected error occurred. Please try again.'
            )}
          </Text>
        </Banner>
      )}

      {pushMutation.isSuccess && (() => {
        const pushed = pushMutation.data.pushed ?? 0;
        return (
          <Banner
            title={pushed > 0
              ? `${pushed} product${pushed !== 1 ? 's' : ''} added to Shopify`
              : 'Products added to Shopify'}
            tone="success"
            onDismiss={() => pushMutation.reset()}
          >
            <Text as="p">{`${pushMutation.data.slots_remaining ?? '—'} slots remaining.`}</Text>
          </Banner>
        );
      })()}

      {atLimit && (
        <Banner title="You've reached your plan limit" tone="warning">
          <Text as="p">
            All {data!.slots_total != null ? data!.slots_total.toLocaleString() : ''} slots are in use.
            Remove products from the <strong>My Shopify Catalog</strong> tab to free up space,
            or upgrade your plan to add more.
          </Text>
        </Banner>
      )}

      <Card padding="0">
        <FilterBar
          searchValue={searchValue}
          onSearchChange={(v) => setSearchValue(v)}
          supplierFilter={supplierFilter}
          onSupplierChange={handleSupplier}
          categoryFilter={categoryFilter}
          onCategoryChange={handleCategory}
          brandFilter={brandFilter}
          onBrandChange={handleBrand}
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
          hasFilters={hasBasicFilters}
          onClear={clearFilters}
        />

        <Divider />

        <ResearchFilterSection
          minCost={minCost}           onMinCost={setMinCost}
          maxCost={maxCost}           onMaxCost={setMaxCost}
          minListPrice={minListPrice} onMinListPrice={setMinListPrice}
          maxListPrice={maxListPrice} onMaxListPrice={setMaxListPrice}
          minQty={minQty}             onMinQty={setMinQty}
          maxQty={maxQty}             onMaxQty={setMaxQty}
          minMargin={minMargin}       onMinMargin={handleMinMargin}
          sortBy={sortBy}             onSortBy={handleSortBy}
          sortDir={sortDir}           onSortDir={handleSortDir}
          activeTags={tagFilters}     onToggleTag={handleToggleTag}
          marketplaceClear={marketplaceClear}
          onMarketplaceClear={(v) => { setMarketplaceClear(v); setPage(1); }}
          complianceClear={noCompliance}
          onComplianceClear={handleNoCompliance}
          activeCount={researchActiveCount}
          onClear={clearResearchFilters}
        />

        {selectedResources.length > 0 && !atLimit && (
          <Box padding="400" paddingBlockStart="0">
            <InlineStack gap="300" blockAlign="center">
              <Text as="span" tone="subdued" variant="bodySm">{selectedResources.length} selected</Text>
              <Button
                variant="primary"
                size="slim"
                loading={pushMutation.isPending}
                onClick={() => pushMutation.mutate(selectedSkus)}
              >
                Add to Shopify
              </Button>
            </InlineStack>
          </Box>
        )}

        <Divider />

        {isError ? null : !isLoading && !isFetching && products.length === 0 ? (
          <Box paddingBlockStart="600" paddingBlockEnd="600">
            <EmptyState
              heading={hasFilters ? 'No products match your filters' : 'No products available to add'}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <Text as="p">
                {hasFilters
                  ? 'Try adjusting your search or removing filters.'
                  : 'All AOA catalog products are already in your Shopify store.'}
              </Text>
            </EmptyState>
          </Box>
        ) : (
          <IndexTable
            resourceName={{ singular: 'product', plural: 'products' }}
            itemCount={rowProducts.length}
            headings={headings}
            selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            loading={isFetching}
          >
            {(() => {
              let pos = 0;
              return groupBySkuWithTiers(rowProducts).map((group) => {
                const key = group[0]._rowId;
                const sku = group[0].aoa_sku;
                const saved = isInWatchlist(sku);
                const addBtn = (
                  <Button size="slim" variant="primary" disabled={atLimit} loading={pushMutation.isPending}
                    onClick={() => { setPushError(null); pushMutation.mutate([sku]); }}>
                    Add to Shopify
                  </Button>
                );
                const saveBtn = (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="slim"
                      variant="plain"
                      tone={saved ? 'success' : undefined}
                      onClick={() => onToggleWatchlist({
                        sku,
                        name:          group[0].product_name,
                        image_url:     group[0].image_url,
                        merchant_cost: group[0].merchant_cost ? parseFloat(group[0].merchant_cost) : null,
                        list_price:    group[0].list_price    ? parseFloat(group[0].list_price)    : null,
                        brand:         group[0].brand,
                        category:      group[0].category_1,
                      })}
                    >
                      {saved ? '★ Saved' : '☆ Save'}
                    </Button>
                  </span>
                );
                const actionEl = (
                  <BlockStack gap="050">
                    {addBtn}
                    {saveBtn}
                  </BlockStack>
                );
                if (group.length === 1) {
                  const el = (
                    <ProductRow key={key} product={group[0]} rowId={key} index={pos}
                      selected={selectedResources.includes(key)} actionButton={actionEl}
                      detailUrl={`/products/${encodeURIComponent(sku)}`} />
                  );
                  pos += 1;
                  return el;
                }
                const expanded = expandedSkus.has(sku);
                const el = (
                  <ProductGroupRows key={key} group={group} startIndex={pos}
                    selectedResources={selectedResources} isExpanded={expanded}
                    onToggle={() => toggleExpand(sku)} actionButton={actionEl}
                    detailUrl={`/products/${encodeURIComponent(sku)}`} />
                );
                pos += expanded ? 1 + group.length : 1;
                return el;
              });
            })()}
          </IndexTable>
        )}
      </Card>

      {pages > 1 && (
        <InlineStack align="center" gap="200" blockAlign="center">
          {isFetching && <Spinner size="small" />}
          <Pagination
            hasPrevious={page > 1}
            onPrevious={() => setPage((p) => p - 1)}
            hasNext={page < pages}
            onNext={() => setPage((p) => p + 1)}
            label={`Page ${page} of ${pages}`}
          />
        </InlineStack>
      )}
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Watchlist tab
// ---------------------------------------------------------------------------

function WatchlistTab({
  items,
  onRemove,
  onClear,
}: {
  items: WatchlistEntry[];
  onRemove: (sku: string) => void;
  onClear: () => void;
}) {
  const queryClient = useQueryClient();

  const pushMutation = useMutation({
    mutationFn: (skus: string[]) => pushCatalog({ skus }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
  });

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="Your watchlist is empty"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <Text as="p">
            Browse <strong>Available to Add</strong> and click <strong>☆ Save</strong> on products you want to review later.
          </Text>
        </EmptyState>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <InlineStack align="end">
        <Button variant="plain" tone="critical" onClick={onClear}>
          Clear all ({String(items.length)})
        </Button>
      </InlineStack>

      <Card padding="0">
        <IndexTable
          resourceName={{ singular: 'product', plural: 'products' }}
          itemCount={items.length}
          headings={[
            { title: '' },
            { title: 'Product' },
            { title: 'Brand' },
            { title: 'Cost' },
            { title: 'List Price' },
            { title: 'Saved' },
            { title: '' },
          ]}
          selectable={false}
        >
          {items.map((item, i) => (
            <IndexTable.Row key={item.sku} id={item.sku} position={i}>
              <IndexTable.Cell>
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name ?? item.sku}
                    style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, background: '#f6f6f7' }}
                  />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 4, background: '#f6f6f7' }} />
                )}
              </IndexTable.Cell>
              <IndexTable.Cell>
                <BlockStack gap="050">
                  <Link url={`/products/${encodeURIComponent(item.sku)}`} removeUnderline>
                    <Text fontWeight="semibold" as="span">{item.name ?? '—'}</Text>
                  </Link>
                  <Text tone="subdued" variant="bodySm" as="span">AOA SKU: {item.sku}</Text>
                </BlockStack>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span">{item.brand ?? '—'}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span">{formatPrice(item.merchant_cost)}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span">{formatPrice(item.list_price)}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text tone="subdued" variant="bodySm" as="span">
                  {new Date(item.added_at).toLocaleDateString()}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <span onClick={(e) => e.stopPropagation()}>
                  <InlineStack gap="200">
                    <Button
                      size="slim"
                      variant="primary"
                      loading={pushMutation.isPending}
                      onClick={() => pushMutation.mutate([item.sku])}
                    >
                      Add to Shopify
                    </Button>
                    <Button
                      size="slim"
                      variant="plain"
                      tone="critical"
                      onClick={() => onRemove(item.sku)}
                    >
                      Remove
                    </Button>
                  </InlineStack>
                </span>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// Push-all progress — lives at page level so it persists across tab switches
// ---------------------------------------------------------------------------

const PUSH_PROGRESS_KEY = 'aoa_push_in_progress';

type AlreadyRunningInfo = { jobId: number; startedAt: string; totalPushed: number };

function usePushAllProgress(summary: CatalogSummary | undefined) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing]           = useState(false);
  const [liveCount, setLiveCount]           = useState<number | null>(null);
  const [retailQueued, setRetailQueued]     = useState<number | null>(null);
  const [vdsQueued, setVdsQueued]           = useState<number | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [alreadyRunning, setAlreadyRunning] = useState<AlreadyRunningInfo | null>(null);
  const [isCancelling, setIsCancelling]     = useState(false);
  const [pushToast, setPushToast]           = useState<{ message: string; tone: 'success' | 'warning' | 'info' } | null>(null);

  const pollIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef           = useRef<number | null>(null);
  const initialActiveRef   = useRef(0);
  const lastTotalPushedRef = useRef(0);
  const pollTickRef        = useRef(0); // counts poll ticks for throttling slot-counter refresh
  // Synchronous lock — set before mutation.mutate() fires, checked before React can re-render.
  const triggeredRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const finishSync = useCallback((totalPushed: number) => {
    stopPolling();
    setIsSyncing(false);
    setRetailQueued(null);
    setVdsQueued(null);
    setAlreadyRunning(null);
    setIsCancelling(false);
    triggeredRef.current = false;
    jobIdRef.current = null;
    sessionStorage.removeItem(PUSH_PROGRESS_KEY);
    setPushToast({
      message: totalPushed > 0
        ? `✅ Done — ${totalPushed.toLocaleString()} product${totalPushed !== 1 ? 's' : ''} added to your store`
        : 'Push complete — no new products were added',
      tone: totalPushed > 0 ? 'success' : 'info',
    });
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['catalogSummary'] });
  }, [stopPolling, queryClient]);

  const startStatusPolling = useCallback(() => {
    stopPolling();
    pollTickRef.current = 0;
    pollIntervalRef.current = setInterval(async () => {
      // Fetch push status and catalog summary in parallel — all UI updates land
      // in the same React render batch with no stagger between banner / summary / slots
      const [statusResult, summaryResult] = await Promise.allSettled([
        getPushStatus(),
        getCatalogSummary(),
      ]);

      if (statusResult.status === 'fulfilled') {
        const status = statusResult.value;
        if (!status.running) {
          finishSync(lastTotalPushedRef.current);
          return;
        }
        // Use summary.total_active as the live counter rather than status.total_pushed.
        // total_pushed stops incrementing once retail finishes — it does not continue
        // through the VDS phase — so the progress bar would freeze at 50%.
        // total_active from the summary IS updated live across both phases.
        if (summaryResult.status === 'fulfilled') {
          const addedSoFar = Math.max(0, (summaryResult.value.total_active ?? 0) - initialActiveRef.current);
          lastTotalPushedRef.current = addedSoFar;
          setLiveCount(addedSoFar);
        } else {
          // Summary failed this tick — fall back to status.total_pushed
          lastTotalPushedRef.current = status.total_pushed;
          setLiveCount(status.total_pushed);
        }
        setRetailQueued(status.total_retail_queued);
        setVdsQueued(status.total_vds_queued);
      }

      if (summaryResult.status === 'fulfilled') {
        // Write directly into the query cache — no second round-trip needed
        queryClient.setQueryData(['catalogSummary'], summaryResult.value);
      }

      // Slot counter (paginated catalog query) only needs updating every ~5 s
      // to avoid excessive re-renders — refresh every other tick at 2.5 s interval
      pollTickRef.current += 1;
      if (pollTickRef.current % 2 === 0) {
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'active'] });
      }
    }, 2_500);
  }, [stopPolling, finishSync, queryClient]);

  // Mount effect: resume from sessionStorage (available before summary loads)
  useEffect(() => {
    const stored = sessionStorage.getItem(PUSH_PROGRESS_KEY);
    if (!stored) return;
    try {
      const { initialCount, startedAt, jobId } = JSON.parse(stored) as {
        initialCount: number; startedAt: string; jobId: number | null;
      };
      const ageMs = Date.now() - new Date(startedAt).getTime();
      if (ageMs > 15 * 60_000) { sessionStorage.removeItem(PUSH_PROGRESS_KEY); return; }
      initialActiveRef.current = initialCount;
      jobIdRef.current = jobId ?? null;
      setIsSyncing(true);
      startStatusPolling();
    } catch { sessionStorage.removeItem(PUSH_PROGRESS_KEY); }
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When summary first loads: if there's an active_job and we're not already tracking it, attach
  const hasAutoDetectedRef = useRef(false);
  useEffect(() => {
    if (hasAutoDetectedRef.current) return;
    if (!summary?.active_job) return;
    if (sessionStorage.getItem(PUSH_PROGRESS_KEY)) return; // already resuming from sessionStorage
    hasAutoDetectedRef.current = true;
    const { job_id, total_pushed, total_retail_queued, total_vds_queued } = summary.active_job;
    jobIdRef.current = job_id;
    lastTotalPushedRef.current = total_pushed;
    setIsSyncing(true);
    setLiveCount(total_pushed);
    setRetailQueued(total_retail_queued);
    setVdsQueued(total_vds_queued);
    startStatusPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.active_job]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Auto-dismiss toast after 6 s
  useEffect(() => {
    if (!pushToast) return;
    const t = setTimeout(() => setPushToast(null), 6_000);
    return () => clearTimeout(t);
  }, [pushToast]);

  const mutation = useMutation({
    mutationFn: () => pushCatalog({ push_all: true }),
    onMutate: () => {
      const initial = summary?.total_active ?? 0;
      initialActiveRef.current = initial;
      lastTotalPushedRef.current = 0;
      setLiveCount(0);
      setRetailQueued(null);
      setVdsQueued(null);
      setIsSyncing(true);
      setError(null);
      sessionStorage.setItem(
        PUSH_PROGRESS_KEY,
        JSON.stringify({ initialCount: initial, startedAt: new Date().toISOString(), jobId: null }),
      );
    },
    onSuccess: (result) => {
      if (result.job_id) {
        jobIdRef.current = result.job_id;
        try {
          const stored = sessionStorage.getItem(PUSH_PROGRESS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as Record<string, unknown>;
            sessionStorage.setItem(PUSH_PROGRESS_KEY, JSON.stringify({ ...parsed, jobId: result.job_id }));
          }
        } catch { /* ignore */ }
      }
      if (!result.job_started) { finishSync(result.pushed ?? 0); return; }
      startStatusPolling();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        // Another push job is already running — attach to it and show a warning
        const detail = err.detail as Partial<PushAlreadyRunningDetail> | undefined;
        triggeredRef.current = false;
        sessionStorage.removeItem(PUSH_PROGRESS_KEY);
        if (detail?.job_id) {
          jobIdRef.current = detail.job_id;
          lastTotalPushedRef.current = detail.total_pushed ?? 0;
          setLiveCount(detail.total_pushed ?? null);
          setAlreadyRunning({
            jobId: detail.job_id,
            startedAt: detail.started_at ?? '',
            totalPushed: detail.total_pushed ?? 0,
          });
          startStatusPolling();
        } else {
          setIsSyncing(false);
          setError('A push job is already running. Wait for it to finish or refresh the page.');
        }
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        const detail = parsePlanLimitDetail(err);
        stopPolling();
        setIsSyncing(false);
        triggeredRef.current = false;
        sessionStorage.removeItem(PUSH_PROGRESS_KEY);
        setError(
          detail
            ? `Your plan limit was reached.${detail.slots_used != null ? ` ${detail.slots_used.toLocaleString()} products were added.` : ''}`
            : err.message || 'An unexpected error occurred.',
        );
        return;
      }
      // Network / timeout / 5xx — server job is likely running; switch to status polling
      startStatusPolling();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelPushJob,
    onMutate: () => setIsCancelling(true),
    onError: () => {
      // 404 = no job running (already finished before cancel reached it)
      finishSync(lastTotalPushedRef.current);
    },
    // onSuccess: keep status polling — backend takes up to ~30 s to drain in-flight work
  });

  return {
    isSyncing,
    isPending: mutation.isPending,
    liveCount,
    retailQueued,
    vdsQueued,
    error,
    alreadyRunning,
    isCancelling,
    pushToast,
    setPushToast,
    startPushAll: () => {
      if (triggeredRef.current || mutation.isPending) return; // synchronous lock
      triggeredRef.current = true;
      setError(null);
      setAlreadyRunning(null);
      mutation.mutate();
    },
    cancelPushAll: () => cancelMutation.mutate(),
    clearError:    () => setError(null),
  };
}

function PushProgressBanner({
  isSyncing,
  liveCount,
  slotsTotal,
  retailQueued,
  vdsQueued,
  alreadyRunning,
  isCancelling,
  onCancel,
  pushToast,
  setPushToast,
}: {
  isSyncing: boolean;
  liveCount: number | null;
  slotsTotal: number | null;
  retailQueued: number | null;
  vdsQueued: number | null;
  alreadyRunning: AlreadyRunningInfo | null;
  isCancelling: boolean;
  onCancel: () => void;
  pushToast: { message: string; tone: 'success' | 'warning' | 'info' } | null;
  setPushToast: (v: null) => void;
}) {
  if (!isSyncing && !pushToast) return null;

  // Phase inferred from which queued counts the backend has finalized
  const phaseLabel =
    retailQueued === null ? 'Adding warehouse products…' :
    vdsQueued    === null ? 'Adding dropship products…'  :
                           'Finishing up…';

  // Use slots_total (retail_cap + vds_cap from settings) as the reliable denominator
  // across both phases — avoids the 500/500 freeze when retail finishes before VDS starts
  const progressPct =
    slotsTotal != null && slotsTotal > 0 && liveCount != null
      ? Math.min(100, Math.round((liveCount / slotsTotal) * 100))
      : 0;

  const progressText =
    liveCount != null && slotsTotal != null
      ? `${liveCount.toLocaleString()} of ${slotsTotal.toLocaleString()} products added`
      : liveCount != null && liveCount > 0
      ? `${liveCount.toLocaleString()} products added so far…`
      : 'Starting…';

  const cancelButton = isCancelling ? (
    <InlineStack gap="200" blockAlign="center">
      <Spinner size="small" />
      <Text as="p" tone="subdued">Cancelling push…</Text>
    </InlineStack>
  ) : (
    <Button variant="secondary" tone="critical" size="slim" onClick={onCancel}>
      Cancel push
    </Button>
  );

  const progressContent = slotsTotal != null && liveCount != null ? (
    <BlockStack gap="100">
      <Text as="p">{progressText}</Text>
      <ProgressBar progress={progressPct} size="small" />
    </BlockStack>
  ) : (
    <InlineStack gap="200" blockAlign="center">
      <Spinner size="small" />
      <Text as="p">{progressText}</Text>
    </InlineStack>
  );

  return (
    <Box paddingBlockEnd="400">
      <BlockStack gap="200">
        {pushToast && (
          <Banner tone={pushToast.tone} onDismiss={() => setPushToast(null)}>
            <Text as="p">{pushToast.message}</Text>
          </Banner>
        )}
        {isSyncing && alreadyRunning && (
          <Banner title={`Push already in progress — Job #${alreadyRunning.jobId}`} tone="warning">
            <BlockStack gap="300">
              <Text as="p">
                A push started{alreadyRunning.startedAt
                  ? ` at ${new Date(alreadyRunning.startedAt).toLocaleTimeString()}`
                  : ''}
                {alreadyRunning.totalPushed > 0
                  ? ` has added ${alreadyRunning.totalPushed.toLocaleString()} products so far.`
                  : ' is running.'}
                {' '}Tracking its progress below.
              </Text>
              {progressContent}
              {cancelButton}
            </BlockStack>
          </Banner>
        )}
        {isSyncing && !alreadyRunning && (
          <Banner title={phaseLabel} tone="info">
            <BlockStack gap="200">
              {progressContent}
              {cancelButton}
            </BlockStack>
          </Banner>
        )}
      </BlockStack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Remove-all progress — lives at page level so it persists across tab switches
// ---------------------------------------------------------------------------

const REMOVE_PROGRESS_KEY = 'aoa_remove_in_progress';

function useRemoveAllProgress() {
  const queryClient = useQueryClient();
  const [isRemoving, setIsRemoving]           = useState(false);
  const [productsMatched, setProductsMatched] = useState<number | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [removeToast, setRemoveToast]         = useState<{ message: string; tone: 'success' | 'info' } | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimerRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const triggeredRef    = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (safetyTimerRef.current)  { clearTimeout(safetyTimerRef.current);   safetyTimerRef.current  = null; }
  }, []);

  const showCompletionToast = useCallback((productsDeleted: number) => {
    const n = productsDeleted;
    setRemoveToast({
      message: n > 0
        ? `${n.toLocaleString()} product${n !== 1 ? 's' : ''} removed from your AOA catalog. Note: Shopify’s admin may take up to 30 minutes to fully reflect this — your slot count here has already updated.`
        : 'Removal complete — your catalog has been cleared.',
      tone: 'success',
    });
  }, []);

  const finishRemove = useCallback((
    outcome: 'completed' | 'failed' | 'aborted',
    productsDeleted?: number,
    errorMsg?: string,
  ) => {
    stopPolling();
    setIsRemoving(false);
    setProductsMatched(null);
    triggeredRef.current = false;
    sessionStorage.removeItem(REMOVE_PROGRESS_KEY);
    if (outcome === 'completed') { showCompletionToast(productsDeleted ?? 0); }
    if (outcome === 'failed')    { setError(errorMsg ?? 'Removal job failed. Please try again.'); }
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['catalogSummary'] });
  }, [stopPolling, showCompletionToast, queryClient]);

  const startStatusPolling = useCallback(() => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const s = await getRemoveStatus();
        if (!s.running) {
          if (s.job_id === null)        { finishRemove('aborted'); return; }
          if (s.status === 'completed') { finishRemove('completed', s.products_deleted); return; }
          if (s.status === 'failed')    { finishRemove('failed', undefined, s.error); return; }
          finishRemove('aborted');
          return;
        }
        if (s.products_matched != null) setProductsMatched(s.products_matched);
      } catch { /* network error — retry on next tick */ }
    }, 4_000);
    // Safety cutoff: stop polling after 30 minutes regardless
    safetyTimerRef.current = setTimeout(() => finishRemove('aborted'), 30 * 60_000);
  }, [stopPolling, finishRemove]);

  // Mount: check status endpoint to resume an in-progress job or surface a missed completion toast
  useEffect(() => {
    const stored = sessionStorage.getItem(REMOVE_PROGRESS_KEY);
    if (!stored) return;
    try {
      const { startedAt } = JSON.parse(stored) as { startedAt: string };
      if (Date.now() - new Date(startedAt).getTime() > 30 * 60_000) {
        sessionStorage.removeItem(REMOVE_PROGRESS_KEY); return;
      }
      void (async () => {
        try {
          const s = await getRemoveStatus();
          if (s.job_id === null) { sessionStorage.removeItem(REMOVE_PROGRESS_KEY); return; }
          if (s.running) {
            if (s.products_matched != null) setProductsMatched(s.products_matched);
            setIsRemoving(true);
            startStatusPolling();
          } else {
            sessionStorage.removeItem(REMOVE_PROGRESS_KEY);
            if (s.status === 'completed') {
              // Show toast only if finished within the last 60 s
              if (Date.now() - new Date(s.finished_at).getTime() < 60_000) {
                showCompletionToast(s.products_deleted);
                void queryClient.invalidateQueries({ queryKey: ['catalog'] });
                void queryClient.invalidateQueries({ queryKey: ['catalogSummary'] });
              }
            } else if (s.status === 'failed') {
              setError(s.error ?? 'Removal job failed.');
            }
          }
        } catch {
          // Network error on resume check — assume still running and start polling
          setIsRemoving(true);
          startStatusPolling();
        }
      })();
    } catch { sessionStorage.removeItem(REMOVE_PROGRESS_KEY); }
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Auto-dismiss toast after 10 s (longer to allow reading the disclaimer)
  useEffect(() => {
    if (!removeToast) return;
    const t = setTimeout(() => setRemoveToast(null), 10_000);
    return () => clearTimeout(t);
  }, [removeToast]);

  const mutation = useMutation({
    mutationFn: () => removeCatalog({ remove_all: true }),
    onMutate: () => {
      setProductsMatched(null);
      setIsRemoving(true);
      setError(null);
      sessionStorage.setItem(REMOVE_PROGRESS_KEY, JSON.stringify({ startedAt: new Date().toISOString() }));
    },
    onSuccess: (result) => {
      if (!result.job_started) {
        // Unexpected sync response for remove_all — finish gracefully
        setIsRemoving(false);
        triggeredRef.current = false;
        sessionStorage.removeItem(REMOVE_PROGRESS_KEY);
        void queryClient.invalidateQueries({ queryKey: ['catalog'] });
        void queryClient.invalidateQueries({ queryKey: ['catalogSummary'] });
        return;
      }
      startStatusPolling();
    },
    onError: (err) => {
      stopPolling();
      setIsRemoving(false);
      triggeredRef.current = false;
      sessionStorage.removeItem(REMOVE_PROGRESS_KEY);
      setError(
        err instanceof ApiError && err.status === 409
          ? 'A removal job is already in progress. Wait for it to finish or refresh the page.'
          : err instanceof ApiError ? err.message : 'Failed to remove products. Please try again.',
      );
    },
  });

  return {
    isRemoving,
    productsMatched,
    error,
    removeToast,
    setRemoveToast,
    startRemoveAll: () => {
      if (triggeredRef.current || mutation.isPending) return;
      triggeredRef.current = true;
      setError(null);
      mutation.mutate();
    },
    clearError: () => setError(null),
  };
}

function RemoveProgressBanner({
  isRemoving,
  productsMatched,
  error,
  onClearError,
  removeToast,
  setRemoveToast,
}: {
  isRemoving: boolean;
  productsMatched: number | null;
  error: string | null;
  onClearError: () => void;
  removeToast: { message: string; tone: 'success' | 'info' } | null;
  setRemoveToast: (v: null) => void;
}) {
  if (!isRemoving && !removeToast && !error) return null;

  return (
    <Box paddingBlockEnd="400">
      <BlockStack gap="200">
        {error && (
          <Banner title="Remove failed" tone="critical" onDismiss={onClearError}>
            <Text as="p">{error}</Text>
          </Banner>
        )}
        {removeToast && (
          <Banner tone={removeToast.tone} onDismiss={() => setRemoveToast(null)}>
            <Text as="p">{removeToast.message}</Text>
          </Banner>
        )}
        {isRemoving && (
          <Banner title="Removing products from your store…" tone="warning">
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="p">
                {productsMatched != null
                  ? `Removing ${productsMatched.toLocaleString()} product${productsMatched !== 1 ? 's' : ''} from Shopify…`
                  : 'Removing products from Shopify…'}
              </Text>
            </InlineStack>
          </Banner>
        )}
      </BlockStack>
    </Box>
  );
}

// ---------------------------------------------------------------------------

export default function ProductsPage() {
  // useSearchParams kept for SSR compatibility; URL state is read via window.location on client
  useSearchParams();

  // ── Lazy-init tab from URL so back-navigation lands on the right tab ──────
  const [selectedTab, setSelectedTab] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('action') === 'push_all') return 1;
    if (sp.get('tab') === 'available')   return 1;
    if (sp.get('tab') === 'watchlist')   return 2;
    return 0;
  });

  // Lazy-init push_all banner
  const [showPushAllBanner, setShowPushAllBanner] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('action') === 'push_all';
  });

  // On mount: clean up ?action=push_all from URL (already handled by lazy inits above)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('action') === 'push_all') {
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab selection — sync active tab to URL
  const handleTabSelect = useCallback((idx: number) => {
    setSelectedTab(idx);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const tabNames: (string | null)[] = [null, 'available', 'watchlist'];
    const tabName = tabNames[idx] ?? null;
    if (tabName) {
      url.searchParams.set('tab', tabName);
    } else {
      // Active catalog tab — remove tab param (filter params stay so switching back restores them)
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Watchlist state — lives here so it persists across tab switches
  const { items: watchlistItems, isInWatchlist, toggleWatchlist, removeFromWatchlist, clearWatchlist } = useWatchlist();

  const catalogTabs = [
    { id: 'active',    content: 'My Shopify Catalog' },
    { id: 'available', content: 'Available to Add'   },
    {
      id: 'watchlist',
      content: watchlistItems.length > 0
        ? `Watchlist (${watchlistItems.length})`
        : 'Watchlist',
    },
  ];

  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryFetchError } = useQuery({
    queryKey: ['catalogSummary'],
    queryFn: getCatalogSummary,
    staleTime: 2 * 60_000,
    retry: 1,
  });

  // Log summary errors in dev so we can diagnose without opening devtools
  if (summaryError && summaryFetchError) {
    console.error('[AOA] /store/catalog/summary failed:', summaryFetchError);
  }

  // Light query for the page subtitle — '_count' discriminator prevents
  // this page_size:1 entry from colliding with the ActiveCatalogTab's
  // page_size:25 query, which shares the same filter-state key at rest.
  const { data: activeCountData } = useQuery({
    queryKey: ['catalog', 'active', '_count'],
    queryFn: () => getCatalog({ status: 'active', page: 1, page_size: 1 }),
    staleTime: 2 * 60_000,
  });
  const total = activeCountData?.total ?? 0;

  // Settings fetched at page level so we can compute the slots denominator for the push
  // progress bar. Uses the same queryKey as ActiveCatalogTab — no extra network call.
  const { data: pageSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 60_000,
  });
  // slotsTotal = retail_cap + vds_cap; null for Pro (unlimited) stores
  const pushSlotsTotal =
    pageSettings?.retail_slot_cap != null && pageSettings?.vds_slot_cap != null
      ? pageSettings.retail_slot_cap + pageSettings.vds_slot_cap
      : null;

  // Push-all progress lives here so it survives tab switches
  const {
    isSyncing:      pushAllIsSyncing,
    isPending:      pushAllIsPending,
    liveCount:      pushAllLiveCount,
    retailQueued:   pushAllRetailQueued,
    vdsQueued:      pushAllVdsQueued,
    error:          pushAllError,
    alreadyRunning: pushAllAlreadyRunning,
    isCancelling:   pushAllIsCancelling,
    pushToast,
    setPushToast,
    startPushAll,
    cancelPushAll,
    clearError:     clearPushAllError,
  } = usePushAllProgress(summary);

  // true when retail is done but VDS is still running — annotates the summary bar dropship count
  const pushVdsPhase = pushAllIsSyncing && pushAllRetailQueued !== null && pushAllVdsQueued === null;

  // Remove-all progress lives here so it survives tab switches
  const {
    isRemoving:      removeAllIsRemoving,
    productsMatched: removeAllProductsMatched,
    error:           removeAllError,
    removeToast,
    setRemoveToast,
    startRemoveAll,
    clearError:      clearRemoveAllError,
  } = useRemoveAllProgress();

  if (summaryLoading && !summary) {
    return (
      <SkeletonPage title="Products">
        <BlockStack gap="400">
          <Card><SkeletonBodyText lines={2} /></Card>
          <Card><SkeletonBodyText lines={12} /></Card>
        </BlockStack>
      </SkeletonPage>
    );
  }

  return (
    <Page
      fullWidth
      title="Products"
      subtitle={
        total > 0
          ? `${total.toLocaleString()} product${total !== 1 ? 's' : ''} in Shopify`
          : 'Manage your AOA product catalog'
      }
    >
      {/* Page-level push banner — visible on all tabs so it survives navigation */}
      <PushProgressBanner
        isSyncing={pushAllIsSyncing}
        liveCount={pushAllLiveCount}
        slotsTotal={pushSlotsTotal}
        retailQueued={pushAllRetailQueued}
        vdsQueued={pushAllVdsQueued}
        alreadyRunning={pushAllAlreadyRunning}
        isCancelling={pushAllIsCancelling}
        onCancel={cancelPushAll}
        pushToast={pushToast}
        setPushToast={setPushToast}
      />
      {/* Page-level remove-all banner — visible on all tabs so it survives navigation */}
      <RemoveProgressBanner
        isRemoving={removeAllIsRemoving}
        productsMatched={removeAllProductsMatched}
        error={removeAllError}
        onClearError={clearRemoveAllError}
        removeToast={removeToast}
        setRemoveToast={setRemoveToast}
      />

      <Tabs tabs={catalogTabs} selected={selectedTab} onSelect={handleTabSelect}>
        <Box paddingBlockStart="400">
          {selectedTab === 0 && (
            <ActiveCatalogTab
              summary={summary}
              summaryLoading={summaryLoading}
              summaryError={summaryError}
              activeTotal={total}
              startRemoveAll={startRemoveAll}
              isRemovingAll={removeAllIsRemoving}
              pushIsSyncing={pushAllIsSyncing}
              vdsPhase={pushVdsPhase}
            />
          )}
          {selectedTab === 1 && (
            <AvailableCatalogTab
              summary={summary}
              showPushAllBanner={showPushAllBanner}
              onDismissPushAllBanner={() => setShowPushAllBanner(false)}
              isInWatchlist={isInWatchlist}
              onToggleWatchlist={toggleWatchlist}
              pushAllIsSyncing={pushAllIsSyncing}
              pushAllIsPending={pushAllIsPending}
              pushAllError={pushAllError}
              onTriggerPushAll={startPushAll}
              onClearPushAllError={clearPushAllError}
            />
          )}
          {selectedTab === 2 && (
            <WatchlistTab
              items={watchlistItems}
              onRemove={removeFromWatchlist}
              onClear={clearWatchlist}
            />
          )}
        </Box>
      </Tabs>
    </Page>
  );
}
