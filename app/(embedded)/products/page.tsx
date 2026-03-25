'use client';

/**
 * app/(embedded)/products/page.tsx
 *
 * Products page — the central hub showing every product AOA has synced
 * from the wholesale catalogue into the merchant's Shopify store.
 *
 * Features:
 * - Live search (debounced 400ms) by title, SKU, or vendor
 * - Status tabs: All / Active / Draft / Archived
 * - IndexTable with thumbnail, title, SKU, vendor, price range, status badge,
 *   and last-synced date
 * - Pagination (25 products per page, keepPreviousData to avoid flash)
 * - Empty states for "never synced" and "no results"
 * - Error banner with retry
 */

import { useState, useEffect } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Thumbnail,
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
  Tabs,
  Box,
  Divider,
} from '@shopify/polaris';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getProducts } from '@/lib/api/products';
import { ApiError } from '@/lib/api/client';
import type { StoreProduct, ProductStatus } from '@/types/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 25;

const STATUS_TABS = [
  { id: 'all',      content: 'All'      },
  { id: 'active',   content: 'Active'   },
  { id: 'draft',    content: 'Draft'    },
  { id: 'archived', content: 'Archived' },
];

const STATUS_FILTER: (ProductStatus | null)[] = [null, 'active', 'draft', 'archived'];

const STATUS_TONE: Record<ProductStatus, 'success' | 'warning' | 'critical'> = {
  active:   'success',
  draft:    'warning',
  archived: 'critical',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(min: string, max: string): string {
  const lo = parseFloat(min);
  const hi = parseFloat(max);
  if (isNaN(lo)) return '—';
  if (lo === hi)  return `$${lo.toFixed(2)}`;
  return `$${lo.toFixed(2)} – $${hi.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState(0);

  // Debounce search input — reset to page 1 on new query
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchValue);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchValue]);

  // Reset to page 1 when status filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedStatusTab]);

  const statusFilter = STATUS_FILTER[selectedStatusTab] ?? null;

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['products', page, debouncedSearch, statusFilter],
    queryFn: () =>
      getProducts({
        page,
        per_page: PER_PAGE,
        search:   debouncedSearch || undefined,
        status:   statusFilter   ?? undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const products: StoreProduct[] = data?.products ?? [];
  const total   = data?.total   ?? 0;
  const pages   = data?.pages   ?? 1;

  const hasFilters = Boolean(debouncedSearch || statusFilter);

  // ---------------------------------------------------------------------------
  // Table rows
  // ---------------------------------------------------------------------------

  const headings = [
    { title: 'Product'     },
    { title: 'SKU'         },
    { title: 'Vendor'      },
    { title: 'Price'       },
    { title: 'Status'      },
    { title: 'Last synced' },
  ] as [{ title: string }, ...{ title: string }[]];

  const rowMarkup = products.map((product, index) => (
    <IndexTable.Row id={product.id} key={product.id} position={index}>
      {/* Product — thumbnail + title + type */}
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center">
          <Thumbnail
            source={product.image_url ?? ''}
            alt={product.title}
            size="small"
          />
          <BlockStack gap="050">
            <Text fontWeight="semibold" as="span">{product.title}</Text>
            {product.product_type && (
              <Text tone="subdued" variant="bodySm" as="span">
                {product.product_type}
              </Text>
            )}
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>

      {/* SKU */}
      <IndexTable.Cell>
        <Text as="span" tone="subdued">{product.sku ?? '—'}</Text>
      </IndexTable.Cell>

      {/* Vendor */}
      <IndexTable.Cell>
        <Text as="span">{product.vendor ?? '—'}</Text>
      </IndexTable.Cell>

      {/* Price range */}
      <IndexTable.Cell>
        <Text as="span">{formatPrice(product.price_min, product.price_max)}</Text>
      </IndexTable.Cell>

      {/* Status badge */}
      <IndexTable.Cell>
        <Badge tone={STATUS_TONE[product.status]}>
          {capitalize(product.status)}
        </Badge>
      </IndexTable.Cell>

      {/* Last synced */}
      <IndexTable.Cell>
        <Text as="span" tone="subdued">{formatDate(product.synced_at)}</Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  // ---------------------------------------------------------------------------
  // Loading skeleton (first load only)
  // ---------------------------------------------------------------------------

  if (isLoading && !data) {
    return (
      <SkeletonPage title="Products">
        <Card>
          <SkeletonBodyText lines={10} />
        </Card>
      </SkeletonPage>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Page
      title="Products"
      subtitle={
        total > 0
          ? `${total.toLocaleString()} product${total !== 1 ? 's' : ''} synced from AOA`
          : 'Products synced from AOA'
      }
    >
      <BlockStack gap="400">
        {/* Error banner */}
        {isError && (
          <Banner
            title="Could not load products"
            tone="critical"
            action={{ content: 'Retry', onAction: refetch }}
          >
            <Text as="p">
              {error instanceof ApiError
                ? error.message
                : 'An unexpected error occurred. Please try again.'}
            </Text>
          </Banner>
        )}

        {/* Main card */}
        <Card padding="0">
          {/* Search bar */}
          <Box padding="400">
            <TextField
              label="Search products"
              labelHidden
              placeholder="Search by name, SKU, or vendor…"
              value={searchValue}
              onChange={(v) => setSearchValue(v)}
              clearButton
              onClearButtonClick={() => setSearchValue('')}
              autoComplete="off"
            />
          </Box>

          <Divider />

          {/* Status filter tabs + table content */}
          <Tabs
            tabs={STATUS_TABS}
            selected={selectedStatusTab}
            onSelect={setSelectedStatusTab}
          >
            {/* Empty state */}
            {!isError && !isFetching && products.length === 0 ? (
              <Box paddingBlockStart="600" paddingBlockEnd="600">
                <EmptyState
                  heading={
                    hasFilters
                      ? 'No products match your filters'
                      : 'No products synced yet'
                  }
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
              /* Products table */
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
          </Tabs>
        </Card>

        {/* Pagination — only shown when there are multiple pages */}
        {pages > 1 && (
          <InlineStack align="center">
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
