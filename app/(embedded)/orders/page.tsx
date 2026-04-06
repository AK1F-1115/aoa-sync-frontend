'use client';

/**
 * app/(embedded)/orders/page.tsx
 *
 * Order list — paginated, multi-selectable table of all Shopify orders.
 *
 * Features:
 *  - Row click → order detail page
 *  - Inline "Purchase" button per pending_purchase row (single-order quick checkout)
 *  - Multi-select + bulk purchase action with per-order results summary
 *  - Margin column  (customer subtotal − AOA cost, product-only / excl. shipping)
 *  - Tracking number column
 *  - Status filter + keyword search
 */

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Page,
  Card,
  IndexTable,
  useIndexResourceState,
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
  Modal,
  List,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getOrders,
  purchaseOrder,
  bulkPurchaseOrders,
  getPaymentMethod,
} from '@/lib/api/orders';
import { ApiError } from '@/lib/api/client';
import type { OrderStatus, OrderListItem, BulkPurchaseResult } from '@/types/api';

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
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: OrderStatus) {
  switch (status) {
    case 'pending_purchase':  return <Badge tone="attention">Pending purchase</Badge>;
    case 'purchased':         return <Badge tone="info">Purchased</Badge>;
    case 'fulfillment_sent':  return <Badge tone="info">Fulfillment sent</Badge>;
    case 'shipped':           return <Badge tone="info">Shipped</Badge>;
    case 'delivered':         return <Badge tone="success">Delivered</Badge>;
    case 'cancelled':         return <Badge tone="enabled">Cancelled</Badge>;
    case 'no_aoa_items':      return <Badge tone="enabled">No AOA items</Badge>;
    default:                  return <Badge>{status}</Badge>;
  }
}

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

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface MarginResult { amount: string; pct: string; positive: boolean }

function calcMargin(subtotal: string | null, aoaCost: string | null): MarginResult | null {
  const s = parseFloat(subtotal ?? '');
  const c = parseFloat(aoaCost ?? '');
  if (isNaN(s) || isNaN(c) || s <= 0) return null;
  const m = s - c;
  return {
    amount:   `$${Math.abs(m).toFixed(2)}`,
    pct:      `${((m / s) * 100).toFixed(0)}%`,
    positive: m >= 0,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrdersPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [page,         setPage]         = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [search,       setSearch]       = useState('');
  const [searchInput,  setSearchInput]  = useState('');

  // ── Single quick-purchase modal ───────────────────────────────────────────
  const [purchaseTarget,      setPurchaseTarget]      = useState<OrderListItem | null>(null);
  const [singlePurchaseError, setSinglePurchaseError] = useState<string | null>(null);

  // ── Bulk purchase modal ───────────────────────────────────────────────────
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkError,       setBulkError]       = useState<string | null>(null);
  const [bulkResults,     setBulkResults]     = useState<{
    succeeded:   number;
    failed:      number;
    requires3ds: number;
    details:     BulkPurchaseResult[];
  } | null>(null);

  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const handleStatusChange = useCallback((v: string) => {
    setStatusFilter(v as OrderStatus | '');
    setPage(1);
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['orders', page, statusFilter, search],
    queryFn: () => getOrders({
      page, per_page: PAGE_SIZE,
      status: statusFilter || undefined,
      search: search || undefined,
    }),
    staleTime: 30_000,
  });

  const { data: paymentMethod } = useQuery({
    queryKey: ['stripePaymentMethod'],
    queryFn:  getPaymentMethod,
    staleTime: 60_000,
  });

  const orders: OrderListItem[] = data?.orders ?? [];
  const pages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  // ── Selection ─────────────────────────────────────────────────────────────
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(orders, { resourceIDResolver: (o) => String(o.id) });

  const clearSelection = useCallback(() => {
    (handleSelectionChange as (t: string, s: boolean) => void)('all', false);
  }, [handleSelectionChange]);

  const selectedPendingOrders = useMemo(
    () => orders.filter(
      (o) => selectedResources.includes(String(o.id)) && o.status === 'pending_purchase',
    ),
    [orders, selectedResources],
  );

  const bulkTotalCost = useMemo(
    () => selectedPendingOrders
      .reduce((sum, o) => sum + parseFloat(o.aoa_total_cost || '0'), 0)
      .toFixed(2),
    [selectedPendingOrders],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const singlePurchaseMutation = useMutation({
    mutationFn: (orderId: number) => purchaseOrder(orderId),
    onSuccess: async (result) => {
      if (result.status === 'succeeded') {
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
        setPurchaseTarget(null);
        setSinglePurchaseError(null);
      } else if (result.status === 'requires_action') {
        // Navigate to detail page where 3DS can be completed
        const id = purchaseTarget?.id;
        setPurchaseTarget(null);
        if (id) router.push(`/orders/${id}`);
      } else {
        setSinglePurchaseError(result.message);
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
        setPurchaseTarget(null);
        return;
      }
      setSinglePurchaseError(
        err instanceof ApiError ? err.message : 'An unexpected error occurred.',
      );
    },
  });

  const bulkPurchaseMutation = useMutation({
    mutationFn: (orderIds: number[]) => bulkPurchaseOrders(orderIds),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      clearSelection();
      setBulkResults({
        succeeded:   result.succeeded,
        failed:      result.failed,
        requires3ds: result.requires_action,
        details:     result.results,
      });
      setBulkError(null);
    },
    onError: (err) => {
      setBulkError(
        err instanceof ApiError ? err.message : 'Bulk purchase failed. Please try again.',
      );
    },
  });

  const handleSinglePurchaseClick = useCallback((order: OrderListItem) => {
    setSinglePurchaseError(null);
    if (!paymentMethod?.has_payment_method) {
      router.push('/settings?tab=payment');
      return;
    }
    setPurchaseTarget(order);
  }, [paymentMethod, router]);

  // ── Table headings ────────────────────────────────────────────────────────
  const headings = [
    { title: 'Order'         },
    { title: 'Customer'      },
    { title: 'Date'          },
    { title: 'Customer paid' },
    { title: 'AOA cost'      },
    { title: 'Margin'        },
    { title: 'Tracking'      },
    { title: 'Status'        },
    { title: ''              },
  ] as [{ title: string }, ...{ title: string }[]];

  if (isLoading) {
    return (
      <SkeletonPage title="Orders">
        <Card><SkeletonBodyText lines={10} /></Card>
      </SkeletonPage>
    );
  }

  const skippedCount = selectedResources.length - selectedPendingOrders.length;
  const bulkLabel    = selectedPendingOrders.length > 0
    ? `Purchase ${selectedPendingOrders.length} order${selectedPendingOrders.length !== 1 ? 's' : ''} — $${bulkTotalCost}`
    : 'Purchase selected (select pending orders)';

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
                    connectedRight={<Button onClick={handleSearch}>Search</Button>}
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
              selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              loading={isFetching}
              promotedBulkActions={[
                {
                  content: bulkLabel,
                  disabled: selectedPendingOrders.length === 0 || bulkPurchaseMutation.isPending,
                  onAction: () => {
                    setBulkError(null);
                    setBulkResults(null);
                    setBulkConfirmOpen(true);
                  },
                },
              ]}
            >
              {orders.map((order, i) => {
                const margin    = calcMargin(order.subtotal_price, order.aoa_total_cost);
                const isPending = order.status === 'pending_purchase';
                return (
                  <IndexTable.Row
                    key={order.id}
                    id={String(order.id)}
                    position={i}
                    selected={selectedResources.includes(String(order.id))}
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
                      {margin ? (
                        <BlockStack gap="0">
                          <Text
                            as="span"
                            tone={margin.positive ? 'success' : 'critical'}
                            fontWeight="semibold"
                          >
                            {margin.positive ? '' : '−'}{margin.amount}
                          </Text>
                          <Text as="span" tone="subdued" variant="bodySm">{margin.pct}</Text>
                        </BlockStack>
                      ) : (
                        <Text as="span" tone="subdued">—</Text>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {order.tracking_number
                        ? <Text as="span" variant="bodySm">{order.tracking_number}</Text>
                        : <Text as="span" tone="subdued">—</Text>
                      }
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {statusBadge(order.status)}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {isPending && (
                        /* Stops row-click navigation when interacting with the purchase button */
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() => handleSinglePurchaseClick(order)}
                          >
                            Purchase
                          </Button>
                        </div>
                      )}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
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

      {/* ── Single-order quick purchase modal ─────────────────────────────── */}
      <Modal
        open={purchaseTarget !== null}
        title="Confirm purchase"
        onClose={() => { setPurchaseTarget(null); setSinglePurchaseError(null); }}
        primaryAction={{
          content: `Pay ${formatPrice(purchaseTarget?.aoa_total_cost)}`,
          loading: singlePurchaseMutation.isPending,
          disabled: !paymentMethod?.has_payment_method || singlePurchaseMutation.isPending,
          onAction: () => { if (purchaseTarget) singlePurchaseMutation.mutate(purchaseTarget.id); },
        }}
        secondaryActions={[{
          content: 'Cancel',
          onAction: () => { setPurchaseTarget(null); setSinglePurchaseError(null); },
        }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Charge{' '}
              <Text as="span" fontWeight="semibold">{formatPrice(purchaseTarget?.aoa_total_cost)}</Text>{' '}
              and submit order{' '}
              <Text as="span" fontWeight="semibold">{purchaseTarget?.shopify_order_number}</Text>{' '}
              to AOA Traders for fulfillment?
            </Text>
            {paymentMethod?.has_payment_method ? (
              <Text as="p" tone="subdued">
                {paymentMethod.card_brand ? `${capitalise(paymentMethod.card_brand)} ` : 'Card '}
                ending in {paymentMethod.card_last4}
              </Text>
            ) : (
              <Banner tone="warning" title="No payment card saved">
                <Text as="p">
                  <Button variant="plain" url="/settings?tab=payment">Add a payment card →</Button>
                </Text>
              </Banner>
            )}
            {singlePurchaseError && (
              <Banner tone="critical">
                <Text as="p">{singlePurchaseError}</Text>
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Bulk purchase confirm / results modal ─────────────────────────── */}
      <Modal
        open={bulkConfirmOpen}
        title={bulkResults
          ? 'Purchase results'
          : `Purchase ${selectedPendingOrders.length} order${selectedPendingOrders.length !== 1 ? 's' : ''}`}
        onClose={() => { setBulkConfirmOpen(false); setBulkResults(null); setBulkError(null); }}
        primaryAction={bulkResults ? {
          content: 'Done',
          onAction: () => { setBulkConfirmOpen(false); setBulkResults(null); },
        } : {
          content: `Pay $${bulkTotalCost}`,
          loading: bulkPurchaseMutation.isPending,
          disabled:
            selectedPendingOrders.length === 0 ||
            bulkPurchaseMutation.isPending ||
            !paymentMethod?.has_payment_method,
          onAction: () => bulkPurchaseMutation.mutate(selectedPendingOrders.map((o) => o.id)),
        }}
        secondaryActions={bulkResults ? [] : [{
          content: 'Cancel',
          onAction: () => { setBulkConfirmOpen(false); setBulkError(null); },
        }]}
      >
        <Modal.Section>
          {bulkResults ? (
            /* Results view */
            <BlockStack gap="300">
              <Text as="p">
                <Text as="span" tone="success" fontWeight="semibold">{bulkResults.succeeded} succeeded</Text>
                {bulkResults.failed > 0 && (
                  <>,{' '}<Text as="span" tone="critical" fontWeight="semibold">{bulkResults.failed} failed</Text></>
                )}
                {bulkResults.requires3ds > 0 && (
                  <>,{' '}<Text as="span" fontWeight="semibold">{bulkResults.requires3ds} require 3D Secure</Text></>
                )}
              </Text>
              {bulkResults.requires3ds > 0 && (
                <Banner tone="warning">
                  <Text as="p">
                    {bulkResults.requires3ds} order{bulkResults.requires3ds !== 1 ? 's require' : ' requires'}{' '}
                    3D Secure authentication. Open each order individually to complete payment.
                  </Text>
                </Banner>
              )}
              {bulkResults.details.filter((r) => r.status !== 'succeeded').length > 0 && (
                <List>
                  {bulkResults.details
                    .filter((r) => r.status !== 'succeeded')
                    .map((r) => (
                      <List.Item key={r.order_id}>
                        <Text as="span" variant="bodySm">Order #{r.order_id}: </Text>
                        <Text
                          as="span"
                          variant="bodySm"
                          tone={r.status === 'failed' ? 'critical' : 'caution'}
                        >
                          {r.status === 'requires_action'
                            ? '3D Secure required — open order to complete'
                            : (r.message ?? 'Failed')}
                        </Text>
                      </List.Item>
                    ))}
                </List>
              )}
            </BlockStack>
          ) : (
            /* Confirm view */
            <BlockStack gap="300">
              <Text as="p">
                Purchase{' '}
                <Text as="span" fontWeight="semibold">
                  {selectedPendingOrders.length} order{selectedPendingOrders.length !== 1 ? 's' : ''}
                </Text>{' '}
                from AOA Traders for a total of{' '}
                <Text as="span" fontWeight="semibold">${bulkTotalCost}</Text>?
              </Text>
              {paymentMethod?.has_payment_method ? (
                <Text as="p" tone="subdued">
                  {paymentMethod.card_brand ? `${capitalise(paymentMethod.card_brand)} ` : 'Card '}
                  ending in {paymentMethod.card_last4}
                </Text>
              ) : (
                <Banner tone="warning" title="No payment card saved">
                  <Text as="p">
                    <Button variant="plain" url="/settings?tab=payment">Add a payment card →</Button>
                  </Text>
                </Banner>
              )}
              {skippedCount > 0 && (
                <Banner tone="info">
                  <Text as="p">
                    {skippedCount} selected order{skippedCount !== 1 ? 's are' : ' is'} not pending
                    purchase and will be skipped.
                  </Text>
                </Banner>
              )}
              {bulkError && (
                <Banner tone="critical">
                  <Text as="p">{bulkError}</Text>
                </Banner>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}


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
