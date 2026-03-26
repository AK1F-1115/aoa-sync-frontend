'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Card,
  IndexTable,
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
  Layout,
  Spinner,
} from '@shopify/polaris';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getCatalog, getCatalogSummary } from '@/lib/api/products';
import type { CatalogProduct, CatalogSummary } from '@/types/api';

const PAGE_SIZE = 25;

function formatPrice(price: string | null): string {
  if (!price) return '—';
  const n = parseFloat(price);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

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

export default function ProductsPage() {
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

  const clearFilters = () => {
    setSearchValue('');
    setDebouncedSearch('');
    setSupplierFilter('');
    setCategoryFilter('');
    setBrandFilter('');
    setPage(1);
  };

  const {
    data: summary,
    isLoading: summaryLoading,
  } = useQuery({
    queryKey: ['catalogSummary'],
    queryFn: getCatalogSummary,
    staleTime: 2 * 60_000,
  });

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['catalog', page, debouncedSearch, supplierFilter, categoryFilter, brandFilter],
    queryFn: () =>
      getCatalog({
        page,
        page_size: PAGE_SIZE,
        search:    debouncedSearch || undefined,
        supplier:  supplierFilter  || undefined,
        category:  categoryFilter  || undefined,
        brand:     brandFilter     || undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const products: CatalogProduct[] = data?.products ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const hasFilters = Boolean(debouncedSearch || supplierFilter || categoryFilter || brandFilter);

  const categoryOptions = toSelectOptions(summary?.top_categories ?? [], 'All categories');
  const brandOptions    = toSelectOptions(summary?.top_brands     ?? [], 'All brands');

  const headings = [
    { title: 'Product'        },
    { title: 'Supplier'       },
    { title: 'Category'       },
    { title: 'Brand'          },
    { title: 'Price'          },
    { title: 'Qty'            },
    { title: 'Shopify status' },
  ] as [{ title: string }, ...{ title: string }[]];

  const supplierLabel = (s: string | null) =>
    s === 'essendant' ? 'Warehouse' : s === 'essendant_vds' ? 'Dropship' : null;
  const supplierTone = (s: string | null) =>
    s === 'essendant' ? ('info' as const) : s === 'essendant_vds' ? ('warning' as const) : undefined;

  const rowMarkup = products.map((product, index) => (
    <IndexTable.Row id={product.shopify_product_id} key={product.shopify_product_id} position={index}>
      <IndexTable.Cell>
        <Text fontWeight="semibold" as="span">{product.name}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {supplierLabel(product.supplier) ? (
          <Badge tone={supplierTone(product.supplier)}>
            {supplierLabel(product.supplier)!}
          </Badge>
        ) : (
          <Text as="span" tone="subdued">—</Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span">{product.category ?? '—'}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span">{product.brand ?? '—'}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span">{formatPrice(product.last_synced_price)}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span">{product.last_synced_quantity ?? '—'}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {product.last_shopify_status ? (
          <Badge tone={product.last_shopify_status === 'active' ? 'success' : undefined}>
            {product.last_shopify_status.charAt(0).toUpperCase() + product.last_shopify_status.slice(1)}
          </Badge>
        ) : (
          <Text as="span" tone="subdued">—</Text>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  if (isLoading && !data) {
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
          ? `${total.toLocaleString()} product${total !== 1 ? 's' : ''} synced from AOA`
          : 'Products synced from AOA'
      }
    >
      <BlockStack gap="400">
        <SummaryBar summary={summary} isLoading={summaryLoading} />

        {isError && (
          <Banner
            title="Could not load products"
            tone="critical"
            action={{ content: 'Retry', onAction: refetch }}
          >
            <Text as="p">
              {(error as Error)?.message || 'An unexpected error occurred. Please try again.'}
            </Text>
          </Banner>
        )}

        <Card padding="0">
          <Box padding="400">
            <BlockStack gap="300">
              <TextField
                label="Search products"
                labelHidden
                placeholder="Search by name, SKU, brand, or category..."
                value={searchValue}
                onChange={(v) => setSearchValue(v)}
                clearButton
                onClearButtonClick={() => setSearchValue('')}
                autoComplete="off"
              />
              <Layout>
                <Layout.Section variant="oneThird">
                  <Select
                    label="Category"
                    options={categoryOptions}
                    value={categoryFilter}
                    onChange={handleCategory}
                  />
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <Select
                    label="Brand"
                    options={brandOptions}
                    value={brandFilter}
                    onChange={handleBrand}
                  />
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  {hasFilters && (
                    <Box paddingBlockStart="600">
                      <button
                        onClick={clearFilters}
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
                    </Box>
                  )}
                </Layout.Section>
              </Layout>
            </BlockStack>
          </Box>

          <Divider />

          {isError ? null : !isFetching && products.length === 0 ? (
            <Box paddingBlockStart="600" paddingBlockEnd="600">
              <EmptyState
                heading={hasFilters ? 'No products match your filters' : 'No products synced yet'}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p">
                  {hasFilters
                    ? 'Try adjusting your search or removing filters.'
                    : 'Products will appear here once AOA Sync has run for your store.'}
                </Text>
              </EmptyState>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: 'product', plural: 'products' }}
              itemCount={products.length}
              headings={headings}
              selectable={false}
              loading={isFetching}
            >
              {rowMarkup}
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
    </Page>
  );
}
