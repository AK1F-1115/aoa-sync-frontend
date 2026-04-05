'use client';

/**
 * app/(embedded)/orders/page.tsx
 *
 * Order list — paginated table of all Shopify orders captured by AOA.
 * Clicking a row navigates to the full order detail page.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Select,
  TextField,
  InlineStack,
  BlockStack,
  Box,
  Button,
  Banner,
  EmptyState,
  SkeletonPage,
  SkeletonBodyText,
  Pagination,
  Divider,
} from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import { getOrders } from '@/lib/api/orders';
import type { OrderStatus, OrderListItem } from '@/types/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { label: string; value: OrderStatus | '' }[] = [
  { label: 'All statuses',        value: ''                  },
  { label: 'Pending purchase',    value: 'pending_purchase'  },
  { label: 'Purchased',           value: 'purchased'         },
  { label: 'Fulfillment sent',    value: 'fulfillment_sent'  },
  { label: 'Shipped',             value: 'shipped'           },
  { label: 'Delivered',           value: 'delivered'         },
  { label: 'Cancelled',           value: 'cancelled'         },
  { label: 'No AOA items',        value: 'no_aoa_items'      },
];

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadge(status: OrderStatus) {
  switch (status) {
    case 'pending_purchase':
      return <Badge tone="attention">Pending purchase</Badge>;
    case 'purchased':
      return <Badge tone="info">Purchased</Badge>;
    case 'fulfillment_sent':
      return <Badge tone="info">Fulfillment sent</Badge>;
    case 'shipped':
      return <Badge tone="info">Shipped</Badge>;
    case 'delivered':
      return <Badge tone="success">Delivered</Badge>;
    case 'cancelled':
      return <Badge tone="enabled">Cancelled</Badge>;
    case 'no_aoa_items':
      return <Badge tone="enabled">No AOA items</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatPrice(price: string | null | undefined): string {
  if (!price) return '—';
  const n = parseFloat(price);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrdersPage() {
  const router = useRouter();

  const [page,         setPage]         = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [search,       setSearch]       = useState('');
  const [searchInput,  setSearchInput]  = useState('');

  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v as OrderStatus | '');
    setPage(1);
  }, []);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['orders', page, statusFilter, search],
    queryFn: () => getOrders({ page, per_page: PAGE_SIZE, status: statusFilter || undefined, search: search || undefined }),
    staleTime: 30_000,
  });

  const orders: OrderListItem[] = data?.orders ?? [];
  const pages  = data?.pages ?? 1;
  const total  = data?.total ?? 0;

  const headings = [
    { title: 'Order'        },
    { title: 'Customer'     },
    { title: 'Date'         },
    { title: 'Customer paid'},
    { title: 'AOA cost'     },
    { title: 'Status'       },
  ] as [{ title: string }, ...{ title: string }[]];

  if (isLoading) {
    return (
      <SkeletonPage title="Orders">
        <Card><SkeletonBodyText lines={10} /></Card>
      </SkeletonPage>
    );
  }

  return (
    <Page
      fullWidth
      title="Orders"
      subtitle={total > 0 ? `${total.toLocaleString()} order${total !== 1 ? 's' : ''}` : undefined}
    >
      <BlockStack gap="400">
        {isError && (
          <Banner title="Could not load orders" tone="critical" action={{ content: 'Retry', onAction: refetch }}>
            <Text as="p">{(error as Error)?.message || 'An unexpected error occurred.'}</Text>
          </Banner>
        )}

        <Card padding="0">
          {/* Filter bar */}
          <Box padding="400">
            <InlineStack gap="300" blockAlign="end" wrap>
              <Box minWidth="200px">
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}>
                  <TextField
                    label="Search"
                    labelHidden
                    placeholder="Order # or customer email"
                    value={searchInput}
                    onChange={setSearchInput}
                    clearButton
                    onClearButtonClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                    autoComplete="off"
                    connectedRight={
                      <Button onClick={handleSearch}>Search</Button>
                    }
                  />
                </div>
              </Box>
              <Box minWidth="180px">
                <Select
                  label="Status"
                  labelHidden
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={handleStatusChange}
                />
              </Box>
            </InlineStack>
          </Box>

          <Divider />

          {!isError && !isLoading && orders.length === 0 ? (
            <Box paddingBlockStart="600" paddingBlockEnd="600">
              <EmptyState
                heading={search || statusFilter ? 'No orders match your filters' : 'No orders yet'}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p">
                  {search || statusFilter
                    ? 'Try adjusting your search or status filter.'
                    : 'Orders will appear here once customers purchase from your Shopify store.'}
                </Text>
              </EmptyState>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: 'order', plural: 'orders' }}
              itemCount={orders.length}
              headings={headings}
              selectable={false}
              loading={isFetching}
            >
              {orders.map((order, i) => (
                <IndexTable.Row
                  key={order.id}
                  id={String(order.id)}
                  position={i}
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  <IndexTable.Cell>
                    <Text fontWeight="semibold" as="span">{order.shopify_order_number}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">{order.customer_email}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{formatDate(order.ordered_at)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{formatPrice(order.subtotal_price)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{formatPrice(order.aoa_total_cost)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {statusBadge(order.status)}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

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
