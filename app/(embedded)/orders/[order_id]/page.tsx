'use client';

/**
 * app/(embedded)/orders/[order_id]/page.tsx
 *
 * Full order detail page.
 *
 * Shows order header, line items, AOA cost, and the "Purchase from AOA"
 * button which drives the Stripe payment + 3DS flow.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  Divider,
  Box,
  DataTable,
  SkeletonPage,
  SkeletonBodyText,
  Modal,
  TextField,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { getOrderDetail, purchaseOrder, getPaymentMethod, updateOrderTracking } from '@/lib/api/orders';
import { ApiError } from '@/lib/api/client';
import type { OrderStatus, OrderDetail } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: string | null | undefined): string {
  if (!price) return '—';
  const n = parseFloat(price);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadge(status: OrderStatus) {
  switch (status) {
    case 'pending_purchase':  return <Badge tone="attention">Pending Payment</Badge>;
    case 'purchased':         return <Badge tone="info">Purchased</Badge>;
    case 'fulfillment_sent':  return <Badge tone="info">Processing</Badge>;
    case 'shipped':           return <Badge tone="success">Shipped</Badge>;
    case 'delivered':         return <Badge tone="success">Delivered</Badge>;
    case 'cancelled':         return <Badge tone="critical">Cancelled</Badge>;
    case 'no_aoa_items':      return <Badge tone="enabled">No AOA Items</Badge>;
    default:                  return <Badge>{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Purchase button + flow
// ---------------------------------------------------------------------------

function PurchaseSection({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [noCardError,   setNoCardError]   = useState(false);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [is3dsLoading,  setIs3dsLoading]  = useState(false);

  // Pre-check: fetch saved card status
  const { data: paymentMethod, isLoading: cardLoading } = useQuery({
    queryKey: ['stripePaymentMethod'],
    queryFn: getPaymentMethod,
    staleTime: 60_000,
  });

  const purchaseMutation = useMutation({
    mutationFn: () => purchaseOrder(order.id),
    onSuccess: async (result) => {
      setConfirmOpen(false);
      if (result.status === 'succeeded') {
        await queryClient.invalidateQueries({ queryKey: ['orderDetail', order.id] });
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
        setPurchaseError(null);
      } else if (result.status === 'requires_action' && result.client_secret) {
        // 3DS — need to confirm server-side payment intent client-side
        setIs3dsLoading(true);
        try {
          // We need the publishable key — re-use setup-intent endpoint is overkill here,
          // so we store it in sessionStorage after setup flow if available.
          // Fallback: use the key stored during card setup, or surface an error.
          const pubKey = sessionStorage.getItem('aoa_stripe_pk') ?? '';
          if (!pubKey) {
            setPurchaseError('3D Secure authentication required but Stripe is not initialised. Please refresh and try again.');
            return;
          }
          const stripe = await loadStripe(pubKey);
          if (!stripe) {
            setPurchaseError('Could not load Stripe. Please refresh and try again.');
            return;
          }
          const { error } = await stripe.confirmCardPayment(result.client_secret);
          if (error) {
            setPurchaseError(error.message ?? 'Card authentication failed.');
          } else {
            // Poll until status flips to purchased
            let attempts = 0;
            const poll = async (): Promise<void> => {
              attempts += 1;
              const fresh = await queryClient.fetchQuery({
                queryKey: ['orderDetail', order.id],
                queryFn: () => getOrderDetail(order.id),
                staleTime: 0,
              });
              if (fresh.status === 'purchased' || attempts >= 10) {
                await queryClient.invalidateQueries({ queryKey: ['orders'] });
                return;
              }
              await new Promise<void>((res) => setTimeout(res, 2000));
              return poll();
            };
            await poll();
          }
        } finally {
          setIs3dsLoading(false);
        }
      } else if (result.status === 'failed') {
        setPurchaseError(result.message);
      }
    },
    onError: (err) => {
      setConfirmOpen(false);
      if (err instanceof ApiError) {
        if (err.status === 409) {
          // Already purchased — just refresh
          void queryClient.invalidateQueries({ queryKey: ['orderDetail', order.id] });
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          return;
        }
        setPurchaseError(err.message);
      } else {
        setPurchaseError('An unexpected error occurred. Please try again.');
      }
    },
  });

  if (order.status !== 'pending_purchase') return null;

  const isLoading = purchaseMutation.isPending || is3dsLoading || cardLoading;
  const cost = parseFloat(order.aoa_total_cost ?? '');

  const handlePurchaseClick = () => {
    setPurchaseError(null);
    setNoCardError(false);
    if (!paymentMethod?.has_payment_method) {
      setNoCardError(true);
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <BlockStack gap="300">
      {noCardError && (
        <Banner title="No payment card saved" tone="warning">
          <InlineStack gap="200" blockAlign="center">
            <Text as="p">You need to save a payment card before purchasing.</Text>
            <Button variant="plain" url="/settings?tab=payment">
              Go to Payment Settings →
            </Button>
          </InlineStack>
        </Banner>
      )}
      {purchaseError && (
        <Banner title="Purchase failed" tone="critical" onDismiss={() => setPurchaseError(null)}>
          <BlockStack gap="200">
            <Text as="p">{purchaseError}</Text>
            <Button variant="plain" url="/settings?tab=payment">
              Update card →
            </Button>
          </BlockStack>
        </Banner>
      )}

      <InlineStack gap="300" blockAlign="center">
        <Button
          variant="primary"
          size="large"
          loading={isLoading}
          disabled={isLoading}
          onClick={handlePurchaseClick}
        >
          Purchase from AOA
        </Button>
        {paymentMethod?.has_payment_method && (
          <Text as="span" tone="subdued" variant="bodySm">
            {paymentMethod.card_brand
              ? `${paymentMethod.card_brand.charAt(0).toUpperCase()}${paymentMethod.card_brand.slice(1)} `
              : ''}
            ending in {paymentMethod.card_last4} will be charged{' '}
            <Text as="span" fontWeight="semibold">{formatPrice(order.aoa_total_cost)}</Text>
          </Text>
        )}
      </InlineStack>

      {/* Confirm modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm purchase"
        primaryAction={{
          content: `Pay ${!isNaN(cost) ? `$${cost.toFixed(2)}` : ''}`,
          loading: purchaseMutation.isPending,
          destructive: false,
          onAction: () => purchaseMutation.mutate(),
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setConfirmOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            This will charge{' '}
            <Text as="span" fontWeight="semibold">{formatPrice(order.aoa_total_cost)}</Text>{' '}
            to your saved card and submit order{' '}
            <Text as="span" fontWeight="semibold">{order.shopify_order_number}</Text>{' '}
            to AOA Traders for fulfillment.
          </Text>
          {paymentMethod?.has_payment_method && (
            <Box paddingBlockStart="200">
              <Text as="p" tone="subdued">
                {paymentMethod.card_brand
                  ? `${paymentMethod.card_brand.charAt(0).toUpperCase()}${paymentMethod.card_brand.slice(1)} `
                  : 'Card '}
                ending in {paymentMethod.card_last4}
              </Text>
            </Box>
          )}
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrderDetailPage() {
  const params      = useParams();
  const router      = useRouter();
  const queryClient = useQueryClient();
  const orderId     = Number(Array.isArray(params.order_id) ? params.order_id[0] : params.order_id);

  // ── Tracking edit state ───────────────────────────────────────────────────
  const [editingTracking,   setEditingTracking]   = useState(false);
  const [trackingInput,     setTrackingInput]     = useState('');
  const [trackingEditError, setTrackingEditError] = useState<string | null>(null);

  const updateTrackingMutation = useMutation({
    mutationFn: (tn: string) => updateOrderTracking(orderId, tn),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orderDetail', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditingTracking(false);
      setTrackingEditError(null);
    },
    onError: (err) => {
      setTrackingEditError(
        err instanceof ApiError ? err.message : 'Could not update tracking number.',
      );
    },
  });

  const { data: order, isLoading, isError, error, refetch } = useQuery<OrderDetail>({
    queryKey: ['orderDetail', orderId],
    queryFn:  () => getOrderDetail(orderId),
    staleTime: 30_000,
    enabled:  !isNaN(orderId),
  });

  if (isLoading) {
    return (
      <SkeletonPage title="Order" backAction>
        <BlockStack gap="400">
          <Card><SkeletonBodyText lines={4} /></Card>
          <Card><SkeletonBodyText lines={8} /></Card>
        </BlockStack>
      </SkeletonPage>
    );
  }

  if (isError || !order) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <Page
        backAction={{ content: 'Orders', onAction: () => router.back() }}
        title="Order not found"
      >
        <Banner
          title={is404 ? 'Order not found' : 'Could not load order'}
          tone="critical"
          action={is404 ? undefined : { content: 'Retry', onAction: () => void refetch() }}
        >
          <Text as="p">
            {is404
              ? 'This order could not be found.'
              : (error as Error)?.message || 'An unexpected error occurred.'}
          </Text>
        </Banner>
      </Page>
    );
  }

  // Line items DataTable rows
  const lineItemRows = order.items.map((item) => [
    <BlockStack gap="050" key={item.id}>
      <Text as="span" fontWeight="semibold">{item.product_name}</Text>
      <Text as="span" tone="subdued" variant="bodySm">AOA SKU: {item.aoa_sku}</Text>
      {item.supplier_sku && (
        <Text as="span" tone="subdued" variant="bodySm">Supplier SKU: {item.supplier_sku}</Text>
      )}
    </BlockStack>,
    item.quantity.toString(),
    formatPrice(item.shopify_price),
    formatPrice(item.merchant_cost),
    formatPrice(item.line_total_cost),
  ]);

  // Totals footer row
  const totalsRow = [
    <Text as="span" fontWeight="semibold" key="total-label">Total AOA cost</Text>,
    '', '', '',
    <Text as="span" fontWeight="semibold" key="total-val">{formatPrice(order.aoa_total_cost)}</Text>,
  ];

  return (
    <Page
      backAction={{ content: 'Orders', onAction: () => router.back() }}
      title={order.shopify_order_number ?? ''}
      subtitle={order.customer_name
        ? `${order.customer_name}${order.customer_email ? ` (${order.customer_email})` : ''}`
        : (order.customer_email ?? undefined)}
      titleMetadata={statusBadge(order.status)}
    >
      <BlockStack gap="400">
        {/* Order metadata */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">Order details</Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem 1.5rem' }}>
              <BlockStack gap="050">
                <Text as="span" variant="bodySm" tone="subdued">Order number</Text>
                <Text as="span" fontWeight="semibold">{order.shopify_order_number}</Text>
              </BlockStack>
              <BlockStack gap="050">
                <Text as="span" variant="bodySm" tone="subdued">Customer</Text>
                <Text as="span">{order.customer_name ?? order.customer_email ?? '—'}</Text>
                {order.customer_name && order.customer_email && (
                  <Text as="span" variant="bodySm" tone="subdued">{order.customer_email}</Text>
                )}
              </BlockStack>
              <BlockStack gap="050">
                <Text as="span" variant="bodySm" tone="subdued">Ordered</Text>
                <Text as="span">{formatDateTime(order.ordered_at)}</Text>
              </BlockStack>
              <BlockStack gap="050">
                <Text as="span" variant="bodySm" tone="subdued">Status</Text>
                {statusBadge(order.status)}
              </BlockStack>
              {order.purchased_at && (
                <BlockStack gap="050">
                  <Text as="span" variant="bodySm" tone="subdued">Purchased from AOA</Text>
                  <Text as="span">{formatDateTime(order.purchased_at)}</Text>
                </BlockStack>
              )}
              {/* Tracking number — always shown; editable once order has been purchased */}
              <BlockStack gap="050">
                <Text as="span" variant="bodySm" tone="subdued">Tracking number</Text>
                {editingTracking ? (
                  <BlockStack gap="200">
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <div onKeyDown={(e) => {
                      if (e.key === 'Enter')  updateTrackingMutation.mutate(trackingInput.trim());
                      if (e.key === 'Escape') setEditingTracking(false);
                    }}>
                      <TextField
                        label="Tracking number"
                        labelHidden
                        value={trackingInput}
                        onChange={setTrackingInput}
                        autoComplete="off"
                        connectedRight={
                          <Button
                            variant="primary"
                            loading={updateTrackingMutation.isPending}
                            onClick={() => updateTrackingMutation.mutate(trackingInput.trim())}
                          >
                            Save
                          </Button>
                        }
                      />
                    </div>
                    {trackingEditError && (
                      <Text as="p" tone="critical" variant="bodySm">{trackingEditError}</Text>
                    )}
                    <Button
                      variant="plain"
                      onClick={() => { setEditingTracking(false); setTrackingEditError(null); }}
                    >
                      Cancel
                    </Button>
                  </BlockStack>
                ) : (
                  <InlineStack gap="200" blockAlign="center">
                    <Text
                      as="span"
                      fontWeight={order.tracking_number ? 'semibold' : 'regular'}
                      tone={order.tracking_number ? undefined : 'subdued'}
                    >
                      {order.tracking_number ?? '—'}
                    </Text>
                    {order.purchased_at && (
                      <Button
                        variant="plain"
                        onClick={() => {
                          setTrackingInput(order.tracking_number ?? '');
                          setEditingTracking(true);
                          setTrackingEditError(null);
                        }}
                      >
                        {order.tracking_number ? 'Edit' : 'Add'}
                      </Button>
                    )}
                  </InlineStack>
                )}
              </BlockStack>
              {/* Shipping address */}
              {order.shipping_address_json && (
                <BlockStack gap="050">
                  <Text as="span" variant="bodySm" tone="subdued">Ship to</Text>
                  <Text as="span">{order.shipping_address_json.name}</Text>
                  <Text as="span">{order.shipping_address_json.address1}</Text>
                  {order.shipping_address_json.address2 && (
                    <Text as="span">{order.shipping_address_json.address2}</Text>
                  )}
                  <Text as="span">
                    {order.shipping_address_json.city}, {order.shipping_address_json.province_code} {order.shipping_address_json.zip}
                  </Text>
                  <Text as="span">{order.shipping_address_json.country}</Text>
                  {order.shipping_address_json.phone && (
                    <Text as="span">{order.shipping_address_json.phone}</Text>
                  )}
                </BlockStack>
              )}
            </div>

            {/* Pricing summary */}
            <Divider />
            <InlineStack align="space-between">
              <Text as="span" tone="subdued">Customer paid (products)</Text>
              <Text as="span">{formatPrice(order.subtotal_price)}</Text>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" fontWeight="semibold">Your AOA cost</Text>
              <Text as="span" fontWeight="semibold">{formatPrice(order.aoa_total_cost)}</Text>
            </InlineStack>
            <InlineStack align="space-between">
              <Text as="span" tone="subdued">Shipping cost</Text>
              {order.shipping_cost
                ? <Text as="span">{formatPrice(order.shipping_cost)}</Text>
                : <Text as="span" tone="subdued">
                    — <Text as="span" variant="bodySm" tone="subdued">(available after AOA processes fulfillment)</Text>
                  </Text>
              }
            </InlineStack>
            {(() => {
              const sub = parseFloat(order.subtotal_price ?? '');
              const aoa = parseFloat(order.aoa_total_cost ?? '');
              if (isNaN(sub) || isNaN(aoa) || sub <= 0) return null;
              const margin    = sub - aoa;
              const marginPct = ((margin / sub) * 100).toFixed(0);
              return (
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">
                    Product margin{' '}
                    <Text as="span" variant="bodySm" tone="subdued">(excl. shipping)</Text>
                  </Text>
                  <Text
                    as="span"
                    fontWeight="semibold"
                    tone={margin >= 0 ? 'success' : 'critical'}
                  >
                    {margin >= 0 ? '$' : '-$'}{Math.abs(margin).toFixed(2)}{' '}({marginPct}%)
                  </Text>
                </InlineStack>
              );
            })()}
          </BlockStack>
        </Card>

        {/* Line items */}
        <Card padding="0">
          <Box padding="400">
            <Text as="h2" variant="headingSm">Line items</Text>
          </Box>
          <DataTable
            columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
            headings={['Product', 'Qty', 'Shopify price', 'Your cost (ea)', 'Line total']}
            rows={lineItemRows}
            footerContent={
              order.items.length > 0 ? (
                <InlineStack align="space-between">
                  <Text as="span" fontWeight="semibold">Total AOA cost</Text>
                  <Text as="span" fontWeight="semibold">{formatPrice(order.aoa_total_cost)}</Text>
                </InlineStack>
              ) : undefined
            }
            totals={totalsRow}
            showTotalsInFooter
          />
        </Card>

        {/* Purchase action — only shown for pending_purchase */}
        {order.status === 'pending_purchase' && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Purchase from AOA</Text>
              <Text as="p" tone="subdued">
                Clicking "Purchase from AOA" will charge your saved card{' '}
                <Text as="span" fontWeight="semibold">{formatPrice(order.aoa_total_cost)}</Text>{' '}
                and submit this order to AOA Traders for fulfillment. The customer paid{' '}
                {formatPrice(order.subtotal_price)} through Shopify — these are separate transactions.
              </Text>
              <PurchaseSection order={order} />
            </BlockStack>
          </Card>
        )}

        {/* Purchased confirmation */}
        {order.status === 'purchased' && order.purchased_at && (
          <Banner title="Order purchased from AOA" tone="success">
            <Text as="p">
              Payment was processed on {formatDateTime(order.purchased_at)}.
              AOA has received the order and will begin fulfillment.
            </Text>
          </Banner>
        )}
      </BlockStack>
    </Page>
  );
}
