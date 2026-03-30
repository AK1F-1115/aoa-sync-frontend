'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getCatalog, getCatalogSummary, pushCatalog, removeCatalog } from '@/lib/api/products';
import { ApiError } from '@/lib/api/client';
import type { CatalogProduct, CatalogSummary, CatalogParams, PlanLimitExceededDetail } from '@/types/api';

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: string | null): string {
  if (!price) return '—';
  const n = parseFloat(price);
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

function SummaryBar({ summary, isLoading }: { summary: CatalogSummary | undefined; isLoading: boolean }) {
  if (isLoading && !summary) {
    return (
      <Card>
        <SkeletonBodyText lines={2} />
      </Card>
    );
  }
  if (!summary) return null;

  const stats = [
    { label: 'Total active',  value: (summary.total_active    ?? 0).toLocaleString() },
    { label: 'Warehouse',     value: (summary.warehouse_count ?? 0).toLocaleString() },
    { label: 'Dropship',      value: (summary.dropship_count  ?? 0).toLocaleString() },
    { label: 'Last sync',     value: formatDateTime(summary.last_sync_at)            },
  ];

  return (
    <Card>
      <InlineStack gap="600" wrap>
        {stats.map(({ label, value }) => (
          <BlockStack gap="050" key={label}>
            <Text as="span" tone="subdued" variant="bodySm">{label}</Text>
            <Text as="span" fontWeight="semibold" variant="bodyMd">{value}</Text>
          </BlockStack>
        ))}
      </InlineStack>
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
          placeholder="Search by name, SKU, brand, or category..."
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
      { value: 'marketplace:no-amazon',  label: 'No Amazon'  },
      { value: 'marketplace:prohibited', label: 'Restricted' },
    ],
  },
];

function TagFilterCheckboxes({
  activeTags,
  onToggle,
}: {
  activeTags: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm" tone="subdued">
        Tag filters are sent to the server — server-side filtering support is required for results to change.
      </Text>
      {TAG_FILTER_GROUPS.map((group) => (
        <InlineStack key={group.label} gap="400" blockAlign="center" wrap>
          <Box minWidth="90px">
            <Text as="span" variant="bodySm" fontWeight="semibold" tone="subdued">{group.label}</Text>
          </Box>
          {group.items.map((item) => (
            <Checkbox
              key={item.value}
              label={item.label}
              checked={activeTags.includes(item.value)}
              onChange={() => onToggle(item.value)}
            />
          ))}
        </InlineStack>
      ))}
    </BlockStack>
  );
}

/** Standalone collapsible tag filter panel — used in the My Shopify Catalog tab. */
function TagFilterSection({
  activeTags,
  onToggle,
  onClearAll,
}: {
  activeTags: string[];
  onToggle: (tag: string) => void;
  onClearAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: 'var(--p-color-text-emphasis)', fontSize: '0.875rem',
  };
  return (
    <Box paddingInline="400" paddingBlock="300">
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center">
          <button style={linkBtn} onClick={() => setExpanded((e) => !e)}>
            {expanded ? '\u25b2 Tag filters' : '\u25bc Tag filters'}
          </button>
          {activeTags.length > 0 && <Badge tone="info">{`${activeTags.length} active`}</Badge>}
          {activeTags.length > 0 && (
            <button style={{ ...linkBtn, textDecoration: 'underline' }} onClick={onClearAll}>
              Clear
            </button>
          )}
        </InlineStack>
        {expanded && (
          <Box background="bg-surface-secondary" padding="400">
            <TagFilterCheckboxes activeTags={activeTags} onToggle={onToggle} />
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
  minMargin, onMinMargin,
  inStockOnly, onInStockOnly,
  sortBy, onSortBy,
  sortDir, onSortDir,
  activeTags, onToggleTag,
  activeCount,
  onClear,
}: {
  minCost: string;      onMinCost: (v: string) => void;
  maxCost: string;      onMaxCost: (v: string) => void;
  minListPrice: string; onMinListPrice: (v: string) => void;
  maxListPrice: string; onMaxListPrice: (v: string) => void;
  minMargin: string;    onMinMargin: (v: string) => void;
  inStockOnly: boolean; onInStockOnly: (v: boolean) => void;
  sortBy: string;       onSortBy: (v: string) => void;
  sortDir: 'asc' | 'desc'; onSortDir: (v: 'asc' | 'desc') => void;
  activeTags: string[];    onToggleTag: (tag: string) => void;
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
              <InlineStack gap="600" blockAlign="end" wrap>
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

                {/* Min margin preset */}
                <Box minWidth="145px">
                  <Select
                    label="Min. margin"
                    helpText="Est. gross margin"
                    options={marginOptions}
                    value={minMargin}
                    onChange={onMinMargin}
                  />
                </Box>

                {/* In stock only */}
                <Box paddingBlockStart="500">
                  <Checkbox
                    label="In stock only"
                    helpText="Qty > 0"
                    checked={inStockOnly}
                    onChange={onInStockOnly}
                  />
                </Box>
              </InlineStack>
              <Divider />
              {/* Tag filters */}
              <TagFilterCheckboxes activeTags={activeTags} onToggle={onToggleTag} />
            </BlockStack>
          </Box>
        )}
      </BlockStack>
    </Box>
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
}: {
  product: CatalogProduct;
  rowId: string;
  index: number;
  selected: boolean;
  actionButton?: React.ReactNode;
  /** When provided, the product name becomes a link to the detail page */
  detailUrl?: string;
}) {
  const status = product.last_shopify_status?.toUpperCase() ?? null;

  return (
    <IndexTable.Row id={rowId} key={rowId} position={index} selected={selected}>
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
            <Text tone="subdued" variant="bodySm" as="span">SKU: {product.aoa_sku}</Text>
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
      <IndexTable.Cell><Text as="span">{formatPrice(product.list_price)}</Text></IndexTable.Cell>
      <IndexTable.Cell><Text as="span">{product.catalog_quantity ?? '—'}</Text></IndexTable.Cell>
      <IndexTable.Cell>
        {status ? (
          <Badge tone={status === 'ACTIVE' ? 'success' : undefined}>
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </Badge>
        ) : product.in_shopify ? (
          <Badge tone="attention">In Shopify</Badge>
        ) : (
          <Badge tone="new">Not pushed</Badge>
        )}
      </IndexTable.Cell>
      {actionButton && <IndexTable.Cell>{actionButton}</IndexTable.Cell>}
    </IndexTable.Row>
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
}: {
  group: RowProduct[];
  startIndex: number;
  selectedResources: string[];
  isExpanded: boolean;
  onToggle: () => void;
  actionButton?: React.ReactNode;
  /** When provided, the product name becomes a link to the detail page */
  detailUrl?: string;
}) {
  const first = group[0];
  const count = group.length;
  const status = first.last_shopify_status?.toUpperCase() ?? null;

  const toggleStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    color: 'var(--p-color-text-emphasis)', fontSize: '0.75rem', lineHeight: 1,
  };

  return (
    <>
      {/* Header row — one checkbox covers the whole group */}
      <IndexTable.Row id={first._rowId} position={startIndex} selected={selectedResources.includes(first._rowId)}>
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
              <Text tone="subdued" variant="bodySm" as="span">SKU: {first.aoa_sku}</Text>
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
          <Text as="span" tone="subdued">
            {isExpanded ? 'See tiers' : `$${Math.min(...group.map(p => parseFloat(p.list_price ?? '0') || 0)).toFixed(2)}\u2009\u2013\u2009$${Math.max(...group.map(p => parseFloat(p.list_price ?? '0') || 0)).toFixed(2)}`}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell><Text as="span">{first.catalog_quantity ?? '\u2014'}</Text></IndexTable.Cell>
        <IndexTable.Cell>
          {status ? (
            <Badge tone={status === 'ACTIVE' ? 'success' : undefined}>
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </Badge>
          ) : first.in_shopify ? (
            <Badge tone="attention">In Shopify</Badge>
          ) : (
            <Badge tone="new">Not pushed</Badge>
          )}
        </IndexTable.Cell>
        {actionButton && <IndexTable.Cell>{actionButton}</IndexTable.Cell>}
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
          <IndexTable.Cell><Text as="span">{product.catalog_quantity ?? '\u2014'}</Text></IndexTable.Cell>
          <IndexTable.Cell />
          <IndexTable.Cell />
        </IndexTable.Row>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// "My Shopify Catalog" tab  (status=active)
// ---------------------------------------------------------------------------

function ActiveCatalogTab({
  summary,
  summaryLoading,
}: {
  summary: CatalogSummary | undefined;
  summaryLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [tagFilters,  setTagFilters]  = useState<string[]>([]);

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
    setTagFilters([]);
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['catalog', 'active', page, debouncedSearch, supplierFilter, categoryFilter, brandFilter, [...tagFilters].sort().join(',')],
    queryFn: () => getCatalog({
      status: 'active', page, page_size: PAGE_SIZE,
      search:   debouncedSearch || undefined,
      supplier: supplierFilter  || undefined,
      category: categoryFilter  || undefined,
      brand:    brandFilter     || undefined,
      tags:     tagFilters.length > 0 ? tagFilters : undefined,
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
    mutationFn: (skus: string[]) => removeCatalog({ skus }),
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
    { title: 'Product' }, { title: 'Type' }, { title: 'Category' }, { title: 'Brand' },
    { title: 'Cost' }, { title: 'List price' }, { title: 'Qty' }, { title: 'Status' }, { title: 'Action' },
  ] as [{ title: string }, ...{ title: string }[]];

  return (
    <BlockStack gap="400">
      <SummaryBar summary={summary} isLoading={summaryLoading} />

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

      {removeMutation.isSuccess && (
        <Banner
          title={`${removeMutation.data.removed} product${removeMutation.data.removed !== 1 ? 's' : ''} removed`}
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
          onClearAll={() => { setTagFilters([]); setPage(1); }}
        />

        {selectedResources.length > 0 && (
          <Box padding="400" paddingBlockStart="0">
            <InlineStack gap="300" blockAlign="center">
              <Text as="span" tone="subdued" variant="bodySm">{selectedResources.length} selected</Text>
              <Button
                tone="critical"
                variant="plain"
                loading={removeMutation.isPending}
                onClick={() => removeMutation.mutate(selectedSkus)}
              >
                Remove from Shopify
              </Button>
            </InlineStack>
          </Box>
        )}

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
                    onClick={() => removeMutation.mutate([group[0].aoa_sku])}>
                    Remove
                  </Button>
                );
                if (group.length === 1) {
                  const el = (
                    <ProductRow key={key} product={group[0]} rowId={key} index={pos}
                      selected={selectedResources.includes(key)} actionButton={removeBtn}
                      detailUrl={`/products/${encodeURIComponent(group[0].aoa_sku)}`} />
                  );
                  pos += 1;
                  return el;
                }
                const expanded = expandedSkus.has(group[0].aoa_sku);
                const el = (
                  <ProductGroupRows key={key} group={group} startIndex={pos}
                    selectedResources={selectedResources} isExpanded={expanded}
                    onToggle={() => toggleExpand(group[0].aoa_sku)} actionButton={removeBtn}
                    detailUrl={`/products/${encodeURIComponent(group[0].aoa_sku)}`} />
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
// "Available to Add" tab  (status=available)
// ---------------------------------------------------------------------------

function AvailableCatalogTab({ summary }: { summary: CatalogSummary | undefined }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [pushError, setPushError] = useState<string | null>(null);

  // Research filters
  const [minCost, setMinCost] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [minListPrice, setMinListPrice] = useState('');
  const [maxListPrice, setMaxListPrice] = useState('');
  const [minMargin, setMinMargin] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  // Debounced price fields (600ms — longer than search to avoid rapid calls while typing)
  const [dMinCost, setDMinCost] = useState('');
  const [dMaxCost, setDMaxCost] = useState('');
  const [dMinList, setDMinList] = useState('');
  const [dMaxList, setDMaxList] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchValue); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchValue]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDMinCost(minCost); setDMaxCost(maxCost);
      setDMinList(minListPrice); setDMaxList(maxListPrice);
      setPage(1);
    }, 600);
    return () => clearTimeout(t);
  }, [minCost, maxCost, minListPrice, maxListPrice]);

  const handleSupplier  = useCallback((v: string)       => { setSupplierFilter(v); setPage(1); }, []);
  const handleCategory  = useCallback((v: string)       => { setCategoryFilter(v); setPage(1); }, []);
  const handleBrand     = useCallback((v: string)       => { setBrandFilter(v);    setPage(1); }, []);
  const handleMinMargin = useCallback((v: string)       => { setMinMargin(v);      setPage(1); }, []);
  const handleInStock   = useCallback((v: boolean)      => { setInStockOnly(v);   setPage(1); }, []);
  const handleSortBy    = useCallback((v: string)       => { setSortBy(v);         setPage(1); }, []);
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
    setMinMargin(''); setInStockOnly(false); setTagFilters([]);
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: [
      'catalog', 'available', page,
      debouncedSearch, supplierFilter, categoryFilter, brandFilter,
      dMinCost, dMaxCost, dMinList, dMaxList, minMargin, inStockOnly, sortBy, sortDir,
      [...tagFilters].sort().join(','),
    ],
    queryFn: () => getCatalog({
      status: 'available', page, page_size: PAGE_SIZE,
      search:         debouncedSearch || undefined,
      supplier:       supplierFilter  || undefined,
      category:       categoryFilter  || undefined,
      brand:          brandFilter     || undefined,
      min_cost:       dMinCost        ? parseFloat(dMinCost)     : undefined,
      max_cost:       dMaxCost        ? parseFloat(dMaxCost)     : undefined,
      min_list_price: dMinList        ? parseFloat(dMinList)     : undefined,
      max_list_price: dMaxList        ? parseFloat(dMaxList)     : undefined,
      min_margin:     minMargin       ? parseInt(minMargin, 10)  : undefined,
      in_stock_only:  inStockOnly     || undefined,
      sort_by:        (sortBy as CatalogParams['sort_by']) || undefined,
      sort_dir:       sortBy          ? sortDir : undefined,
      tags:           tagFilters.length > 0 ? tagFilters : undefined,
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
      dMinCost, dMaxCost, dMinList, dMaxList, minMargin, inStockOnly, sortBy, sortDir, tagFilters]);

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
  const researchActiveCount = [dMinCost, dMaxCost, dMinList, dMaxList, minMargin]
    .filter(Boolean).length + (inStockOnly ? 1 : 0) + tagFilters.length;
  const hasFilters = hasBasicFilters || researchActiveCount > 0 || Boolean(sortBy);

  const categoryOptions = toSelectOptions(summary?.categories ?? [], 'All categories');
  const brandOptions    = toSelectOptions(summary?.brands     ?? [], 'All brands');

  const selectedSkus = [...new Set(
    selectedResources
      .map((rowId) => rowProducts.find((p) => p._rowId === rowId)?.aoa_sku)
      .filter((sku): sku is string => sku !== undefined)
  )];

  const headings = [
    { title: 'Product' }, { title: 'Type' }, { title: 'Category' }, { title: 'Brand' },
    { title: 'Cost' }, { title: 'List price' }, { title: 'Qty' }, { title: 'Status' }, { title: 'Action' },
  ] as [{ title: string }, ...{ title: string }[]];

  const showPushError = pushError !== null || (pushMutation.isError && !pushError);
  const atLimit = data != null && data.slots_remaining === 0;

  return (
    <BlockStack gap="400">
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

      {pushMutation.isSuccess && (
        <Banner
          title={`${pushMutation.data.pushed} product${pushMutation.data.pushed !== 1 ? 's' : ''} added to Shopify`}
          tone="success"
          onDismiss={() => pushMutation.reset()}
        >
          <Text as="p">{`${pushMutation.data.slots_remaining ?? '\u2014'} slots remaining.`}</Text>
        </Banner>
      )}

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
          minMargin={minMargin}       onMinMargin={handleMinMargin}
          inStockOnly={inStockOnly}   onInStockOnly={handleInStock}
          sortBy={sortBy}             onSortBy={handleSortBy}
          sortDir={sortDir}           onSortDir={handleSortDir}
          activeTags={tagFilters}     onToggleTag={handleToggleTag}
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
                const addBtn = (
                  <Button size="slim" variant="primary" disabled={atLimit} loading={pushMutation.isPending}
                    onClick={() => { setPushError(null); pushMutation.mutate([group[0].aoa_sku]); }}>
                    Add to Shopify
                  </Button>
                );
                if (group.length === 1) {
                  const el = (
                    <ProductRow key={key} product={group[0]} rowId={key} index={pos}
                      selected={selectedResources.includes(key)} actionButton={addBtn} />
                  );
                  pos += 1;
                  return el;
                }
                const expanded = expandedSkus.has(group[0].aoa_sku);
                const el = (
                  <ProductGroupRows key={key} group={group} startIndex={pos}
                    selectedResources={selectedResources} isExpanded={expanded}
                    onToggle={() => toggleExpand(group[0].aoa_sku)} actionButton={addBtn} />
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

const CATALOG_TABS = [
  { id: 'active',    content: 'My Shopify Catalog' },
  { id: 'available', content: 'Available to Add'   },
];

export default function ProductsPage() {
  const [selectedTab, setSelectedTab] = useState(0);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['catalogSummary'],
    queryFn: getCatalogSummary,
    staleTime: 2 * 60_000,
  });

  // Light query for the page subtitle — '_count' discriminator prevents
  // this page_size:1 entry from colliding with the ActiveCatalogTab's
  // page_size:25 query, which shares the same filter-state key at rest.
  const { data: activeCountData } = useQuery({
    queryKey: ['catalog', 'active', '_count'],
    queryFn: () => getCatalog({ status: 'active', page: 1, page_size: 1 }),
    staleTime: 2 * 60_000,
  });
  const total = activeCountData?.total ?? 0;

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
      <Tabs tabs={CATALOG_TABS} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="400">
          {selectedTab === 0 && (
            <ActiveCatalogTab summary={summary} summaryLoading={summaryLoading} />
          )}
          {selectedTab === 1 && (
            <AvailableCatalogTab summary={summary} />
          )}
        </Box>
      </Tabs>
    </Page>
  );
}
