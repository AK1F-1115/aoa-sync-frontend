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
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getCatalog, getCatalogSummary, pushCatalog, removeCatalog } from '@/lib/api/products';
import { ApiError } from '@/lib/api/client';
import type { CatalogProduct, CatalogSummary, PlanLimitExceededDetail } from '@/types/api';

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
}: {
  product: CatalogProduct;
  rowId: string;
  index: number;
  selected: boolean;
  actionButton?: React.ReactNode;
}) {
  const status = product.last_shopify_status?.toUpperCase() ?? null;

  return (
    <IndexTable.Row id={rowId} key={rowId} position={index} selected={selected}>
      <IndexTable.Cell>
        <BlockStack gap="050">
          <Text fontWeight="semibold" as="span">{product.product_name ?? '—'}</Text>
          <InlineStack gap="100" blockAlign="center">
            <Text tone="subdued" variant="bodySm" as="span">SKU: {product.aoa_sku}</Text>
            {product.variant_tier != null && product.variant_tier > 1 && (
              <Badge tone="info" size="small">{`Qty ×${product.variant_tier}`}</Badge>
            )}
          </InlineStack>
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
      <IndexTable.Cell><Text as="span">{formatPrice(product.aoa_cost)}</Text></IndexTable.Cell>
      <IndexTable.Cell><Text as="span">{formatPrice(product.list_price)}</Text></IndexTable.Cell>
      <IndexTable.Cell><Text as="span">{product.last_synced_quantity ?? '—'}</Text></IndexTable.Cell>
      <IndexTable.Cell>
        {status ? (
          <Badge tone={status === 'ACTIVE' ? 'success' : undefined}>
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </Badge>
        ) : (
          <Badge tone="new">Not pushed</Badge>
        )}
      </IndexTable.Cell>
      {actionButton && <IndexTable.Cell>{actionButton}</IndexTable.Cell>}
    </IndexTable.Row>
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

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchValue); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchValue]);

  const handleSupplier = useCallback((v: string) => { setSupplierFilter(v); setPage(1); }, []);
  const handleCategory = useCallback((v: string) => { setCategoryFilter(v); setPage(1); }, []);
  const handleBrand    = useCallback((v: string) => { setBrandFilter(v);    setPage(1); }, []);
  const clearFilters   = () => {
    setSearchValue(''); setDebouncedSearch('');
    setSupplierFilter(''); setCategoryFilter(''); setBrandFilter('');
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['catalog', 'active', page, debouncedSearch, supplierFilter, categoryFilter, brandFilter],
    queryFn: () => getCatalog({
      status: 'active', page, page_size: PAGE_SIZE,
      search:   debouncedSearch || undefined,
      supplier: supplierFilter  || undefined,
      category: categoryFilter  || undefined,
      brand:    brandFilter     || undefined,
    }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const products = data?.items ?? data?.products ?? [];
  const pages    = data?.pages ?? 1;

  type RowProduct = CatalogProduct & { _rowId: string; [key: string]: unknown };
  const rowProducts: RowProduct[] = products.map((p, i) => ({
    ...p,
    _rowId: `active-${(page - 1) * PAGE_SIZE + i}`,
  }));

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rowProducts, { resourceIDResolver: (p) => p._rowId });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (handleSelectionChange as (t: string, s: boolean) => void)('all', false);
  }, [page, debouncedSearch, supplierFilter, categoryFilter, brandFilter]);

  const removeMutation = useMutation({
    mutationFn: (skus: string[]) => removeCatalog({ skus }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['catalog'] }); },
  });

  const hasFilters = Boolean(debouncedSearch || supplierFilter || categoryFilter || brandFilter);
  const categoryOptions = toSelectOptions(summary?.categories ?? [], 'All categories');
  const brandOptions    = toSelectOptions(summary?.brands     ?? [], 'All brands');

  const selectedSkus = selectedResources
    .map((rowId) => rowProducts.find((p) => p._rowId === rowId)?.aoa_sku)
    .filter((sku): sku is string => sku !== undefined);

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
            {rowProducts.map((product, index) => (
              <ProductRow
                key={product._rowId}
                product={product}
                rowId={product._rowId}
                index={index}
                selected={selectedResources.includes(product._rowId)}
                actionButton={
                  <Button
                    size="slim"
                    tone="critical"
                    variant="plain"
                    loading={removeMutation.isPending}
                    onClick={() => removeMutation.mutate([product.aoa_sku])}
                  >
                    Remove
                  </Button>
                }
              />
            ))}
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

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchValue); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchValue]);

  const handleSupplier = useCallback((v: string) => { setSupplierFilter(v); setPage(1); }, []);
  const handleCategory = useCallback((v: string) => { setCategoryFilter(v); setPage(1); }, []);
  const handleBrand    = useCallback((v: string) => { setBrandFilter(v);    setPage(1); }, []);
  const clearFilters   = () => {
    setSearchValue(''); setDebouncedSearch('');
    setSupplierFilter(''); setCategoryFilter(''); setBrandFilter('');
    setPage(1);
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['catalog', 'available', page, debouncedSearch, supplierFilter, categoryFilter, brandFilter],
    queryFn: () => getCatalog({
      status: 'available', page, page_size: PAGE_SIZE,
      search:   debouncedSearch || undefined,
      supplier: supplierFilter  || undefined,
      category: categoryFilter  || undefined,
      brand:    brandFilter     || undefined,
    }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const products = data?.items ?? data?.products ?? [];
  const pages    = data?.pages ?? 1;

  type RowProduct = CatalogProduct & { _rowId: string; [key: string]: unknown };
  const rowProducts: RowProduct[] = products.map((p, i) => ({
    ...p,
    _rowId: `avail-${(page - 1) * PAGE_SIZE + i}`,
  }));

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rowProducts, { resourceIDResolver: (p) => p._rowId });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (handleSelectionChange as (t: string, s: boolean) => void)('all', false);
  }, [page, debouncedSearch, supplierFilter, categoryFilter, brandFilter]);

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

  const hasFilters = Boolean(debouncedSearch || supplierFilter || categoryFilter || brandFilter);
  const categoryOptions = toSelectOptions(summary?.categories ?? [], 'All categories');
  const brandOptions    = toSelectOptions(summary?.brands     ?? [], 'All brands');

  const selectedSkus = selectedResources
    .map((rowId) => rowProducts.find((p) => p._rowId === rowId)?.aoa_sku)
    .filter((sku): sku is string => sku !== undefined);

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
          <Text as="p">{`${pushMutation.data.slots_remaining ?? '—'} slots remaining.`}</Text>
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
          hasFilters={hasFilters}
          onClear={clearFilters}
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
            {rowProducts.map((product, index) => (
              <ProductRow
                key={product._rowId}
                product={product}
                rowId={product._rowId}
                index={index}
                selected={selectedResources.includes(product._rowId)}
                actionButton={
                  <Button
                    size="slim"
                    variant="primary"
                    disabled={atLimit}
                    loading={pushMutation.isPending}
                    onClick={() => { setPushError(null); pushMutation.mutate([product.aoa_sku]); }}
                  >
                    Add to Shopify
                  </Button>
                }
              />
            ))}
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

  // Light query for the page subtitle (1 item, cached)
  const { data: activeCountData } = useQuery({
    queryKey: ['catalog', 'active', 1, '', '', '', ''],
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
